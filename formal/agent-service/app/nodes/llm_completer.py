# LLM Completer 节点 — 调 MiMo 生成结构化 proposal + reply.
#
# 职责: 在意图/槽位/PendingWrite 都已确定后, 把上下文 + RAG(未来) + official constraints
#       拼成 system prompt, 调 MiMo, 解析结构化 JSON 输出。
#       模型路由: 有图 -> mimo-v2.5, 无图 -> mimo-v2-flash。
#
# 失败策略: LLM 调用失败 -> 用 subagent 的确定性 draft reply 兜底 (不阻断主流程)。

from __future__ import annotations

import json
import logging
import re
from typing import TYPE_CHECKING, Any

from app.adapters import PendingWrite
from app.core import get_settings
from app.core.exceptions import ProviderError
from app.llm.provider import build_model_for_request
from app.nodes import subagents
from app.nodes.prompt_builder import build_system_prompt
from app.nodes.slot_parser import parse_slots
from app.types.agent_types import (
    AgentIntent,
    MODEL_ASSISTED_INTENTS,
    ResponseMode,
)

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from app.graph.state import AgentGraphState


def _strip_markdown_json(raw: str) -> str:
    """MiMo 偶尔会输出 ```json ... ``` 包裹, 兼容剥壳。"""
    text = (raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text).strip()
    return text


_SOURCE_MARKER_RE = re.compile(r"\[来源[：:]")


def _has_source_marker(text: str) -> bool:
    """检测回复是否已含来源标注 ([来源: ...])."""
    return bool(_SOURCE_MARKER_RE.search(text or ""))


def _extract_json_object(text: str) -> dict[str, Any] | None:
    """从模型输出里抠出第一个完整 JSON 对象。失败返回 None。"""
    cleaned = _strip_markdown_json(text)
    # 直接试
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    # 抠 {...} (DOTALL 跨行)
    m = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            return None
    return None


def _build_context_data(state: AgentGraphState) -> dict[str, Any]:
    """组装喂给 prompt_builder 的上下文 data。"""
    inp = state.get("input", {})
    return {
        "userId": inp.get("user_id", ""),
        "profile": inp.get("profile", {}),
        "recentLogs": inp.get("recent_logs", []),
        "history": inp.get("history", []),
        "memory": inp.get("memory", []),
        "intent": state.get("intent", AgentIntent.UNSUPPORTED).value if state.get("intent") else "",
        "slots": state.get("slots", {}),
    }


def _build_user_message(state: AgentGraphState) -> str:
    """构造发给 LLM 的 user message。"""
    inp = state.get("input", {})
    msg = inp.get("message", "")
    image_urls = inp.get("images") or inp.get("image_data") or []
    parts = [msg] if msg else []
    if image_urls:
        parts.append(f"(用户附带了 {len(image_urls)} 张图片)")
    return "\n".join(parts) or "(无文本)"


def _slots_from_state(state: AgentGraphState) -> dict[str, Any]:
    """取已 parse 的 slots; 没有就现场 parse。"""
    slots = state.get("slots")
    if slots:
        return slots
    intent = state.get("intent", AgentIntent.UNSUPPORTED)
    inp = state.get("input", {})
    images = inp.get("images") or inp.get("image_data") or []
    return parse_slots(
        intent, inp.get("message", ""),
        has_images=bool(images),
    )


def _ensure_pending_write(
    state: AgentGraphState, slots: dict[str, Any]
) -> PendingWrite | None:
    """对需要写入的意图, 用 subagent 确定性构造 PendingWrite。

    这是"结构化 proposal"的真正来源 — 不依赖 LLM 决定要不要写 (避免幻觉写入)。
    LLM 只负责生成更自然的 reply 文本, 不决定写入与否。
    """
    intent = state.get("intent")
    if intent == AgentIntent.DIET_RECORD:
        return subagents.build_diet_record_pending(slots)
    if intent == AgentIntent.TRAINING_RECORD:
        return subagents.build_training_log_pending(slots)
    if intent == AgentIntent.TRAINING_PLAN_CREATE:
        return subagents.build_training_plan_pending(slots, "create")
    if intent == AgentIntent.TRAINING_PLAN_UPDATE:
        return subagents.build_training_plan_pending(slots, "update")
    if intent == AgentIntent.BODY_ANALYSIS and subagents.has_body_metrics(slots):
        return subagents.build_body_metric_pending(slots)
    return None


def _draft_reply(state: AgentGraphState, slots: dict[str, Any]) -> str:
    """LLM 失败时的确定性兜底回复。"""
    intent = state.get("intent", AgentIntent.UNSUPPORTED)
    if intent == AgentIntent.DIET_RECORD:
        return subagents.build_diet_record_reply(slots)
    if intent == AgentIntent.TRAINING_RECORD:
        return subagents.build_training_log_reply(slots)
    if intent == AgentIntent.TRAINING_PLAN_CREATE:
        return subagents.build_training_plan_reply(slots, "create")
    if intent == AgentIntent.TRAINING_PLAN_UPDATE:
        return subagents.build_training_plan_reply(slots, "update")
    if intent == AgentIntent.BODY_ANALYSIS:
        if subagents.has_body_metrics(slots):
            return subagents.build_body_analysis_reply(slots)
        return subagents.build_body_analysis_reply(slots, advice="")
    if intent == AgentIntent.DIET_SUGGESTION:
        return subagents.build_diet_suggestion_reply()
    return subagents.build_unsupported_reply()


# ============================================================
# 主节点
# ============================================================
async def node_completer(state: AgentGraphState) -> dict[str, Any]:
    """CALL_MODEL 路径: 调 MiMo 生成更自然的 reply; PendingWrite 走确定性构造。

    short_circuit 意图 (CONFIRM/CANCEL/UNSUPPORTED) 不会走到这里。
    """
    settings = get_settings()
    intent = state.get("intent", AgentIntent.UNSUPPORTED)
    slots = _slots_from_state(state)
    inp = state.get("input", {})
    images = inp.get("images") or inp.get("image_data") or []
    has_images = bool(images)

    # 1. 确定性构造 PendingWrite (结构化 proposal 来源, 不依赖 LLM)
    pending_write = _ensure_pending_write(state, slots)

    # 2. 决定 response_mode
    if intent in MODEL_ASSISTED_INTENTS:
        response_mode = ResponseMode.CALL_MODEL
    else:
        response_mode = ResponseMode.SHORT_CIRCUIT

    trace = state.get("trace", []) + [
        {"stage": "completer.enter", "data": {
            "intent": intent.value, "has_images": has_images,
            "has_pending": pending_write is not None,
        }}
    ]

    # 3. short_circuit 意图 (DIET_RECORD/TRAINING_RECORD 等纯记录) -> 不调 LLM, 用 draft reply
    if response_mode == ResponseMode.SHORT_CIRCUIT or not settings.llm_configured:
        reply = _draft_reply(state, slots)
        if not settings.llm_configured:
            trace.append({"stage": "completer.llm_skipped", "data": {"reason": "llm_not_configured"}})
        return {
            "slots": slots,
            "pending_write": pending_write,
            "model_reply": reply,
            "response_mode": ResponseMode.SHORT_CIRCUIT,
            "trace": trace,
        }

    # 4. CALL_MODEL -> 调 MiMo
    try:
        llm = build_model_for_request(settings, has_images=has_images, temperature=0.3)
        from langchain_core.messages import HumanMessage, SystemMessage

        # RAG 检索 (M3): 仅 CALL_MODEL 意图才检索, 失败降级不阻断
        rag_context = ""
        rag_sources: list[str] = []
        try:
            from app.retrieval import build_rag_context
            message = inp.get("message", "")
            if message:
                rag = await build_rag_context(message, top_k=settings.ragflow_top_k)
                rag_context = rag.get("context", "")
                for hit in rag.get("hits", []):
                    src = (hit.get("chunk") or {}).get("source")
                    if src and src not in rag_sources:
                        rag_sources.append(src)
                if rag.get("augmented"):
                    trace.append({"stage": "completer.rag_augmented", "data": {
                        "driver": rag.get("driver"), "hits": len(rag.get("hits", [])),
                    }})
        except Exception as rag_err:  # noqa: BLE001
            trace.append({"stage": "completer.rag_failed", "data": {"error": type(rag_err).__name__}})

        system_prompt = build_system_prompt({"data": _build_context_data(state)})
        if rag_context:
            system_prompt = (
                system_prompt + "\n\n【RAG 参考片段】(回答涉及下列数据时必须标注来源)\n" + rag_context
            )

        # 多模态: 图片走 image_url content
        user_content: list[dict[str, Any]] | str
        if has_images:
            user_content = [{"type": "text", "text": _build_user_message(state)}]
            for url in images[:3]:  # 前端约束 ≤3 图
                user_content.append({"type": "image_url", "image_url": {"url": url}})
        else:
            user_content = _build_user_message(state)

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_content),
        ]
        resp = await llm.ainvoke(messages)
        raw = resp.content if isinstance(resp.content, str) else str(resp.content)
        parsed = _extract_json_object(raw)

        if parsed and isinstance(parsed, dict):
            reply = str(parsed.get("answer") or parsed.get("content") or "").strip()
            if not reply:
                reply = _draft_reply(state, slots)
            # RAG 来源标注: 若检索到来源但模型没标注, 追加来源
            if rag_sources and not _has_source_marker(reply):
                reply = reply.rstrip() + "\n\n[来源: " + " / ".join(rag_sources[:3]) + "]"
            model_name = getattr(resp, "response_metadata", {}).get("model_name", settings.mimo_model)
            trace.append({"stage": "completer.llm_ok", "data": {
                "model": model_name, "parsed": True, "rag_sources": rag_sources,
                "has_proposal_in_llm": bool(parsed.get("payload", {}).get("proposals") if isinstance(parsed.get("payload"), dict) else False),
            }})
        else:
            # 模型没输出合法 JSON -> 直接用原文当 reply (可能是纯文本建议), 不阻断
            reply = _strip_markdown_json(raw).strip() or _draft_reply(state, slots)
            if rag_sources and not _has_source_marker(reply):
                reply = reply.rstrip() + "\n\n[来源: " + " / ".join(rag_sources[:3]) + "]"
            trace.append({"stage": "completer.llm_non_json", "data": {"len": len(raw), "rag_sources": rag_sources}})
    except ProviderError as e:
        # provider 错误向上抛 (handler 会渲染中文提示)
        trace.append({"stage": "completer.provider_error", "data": {"kind": e.kind}})
        return {
            "slots": slots,
            "pending_write": pending_write,
            "model_reply": _draft_reply(state, slots),
            "response_mode": ResponseMode.SHORT_CIRCUIT,
            "trace": trace,
            "_provider_error": e,
        }
    except Exception as e:  # noqa: BLE001 - LLM 失败必须降级到 draft reply
        logger.warning("completer_llm_failed error=%s", e)
        reply = _draft_reply(state, slots)
        trace.append({"stage": "completer.llm_failed_fallback", "data": {"error": type(e).__name__}})

    return {
        "slots": slots,
        "pending_write": pending_write,
        "model_reply": reply,
        "response_mode": response_mode,
        "trace": trace,
    }


__all__ = ["node_completer"]
