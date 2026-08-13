# 主图 — M2 阶段: 规则+LLM 双路意图路由 + 5 subagent + 确认/取消 + finalize.
#
# 编排:
#   START
#     -> intent_router  (规则命中直接出 guess; 否则异步调 fast LLM)
#        | route_after_intent
#        +-- CONFIRM/CANCEL  -> write_handler -> finalize
#        +-- UNSUPPORTED      -> finalize
#        +-- 其它             -> completer   -> finalize
#     -> END
#
# 与 Node harness 的差异:
#   - agent-service 不直接访问 DB, 确认写入的"实际落库"由云函数在收到 confirmed 状态后执行.
#   - 这里只做 pendingWrite 的状态迁移 (waiting -> confirmed/cancelled/expired/failed),
#     并在 Answer 里把 pendingWrite 带回给云函数.
#   - pendingWrite 来源: 优先用 previous_state 里带回来的 (多轮); 否则 completer 构造新的.

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from langgraph.graph import END, START, StateGraph

from app.adapters import build_answer
from app.adapters.miniprogram_adapter import PendingWrite, _unsupported_reply
from app.core import get_settings
from app.graph.state import AgentGraphState
from app.guardrails import input_guardrail
from app.memory import classify_memory_update
from app.nodes import subagents
from app.nodes.intent_router import IntentGuess, recognize_intent_llm, recognize_intent_rule
from app.nodes.llm_completer import node_completer as _node_completer
from app.nodes.slot_parser import parse_slots
from app.types.agent_types import (
    AgentIntent,
    MODEL_ASSISTED_INTENTS,
    PendingWriteStatus,
    PendingWriteType,
    ResponseMode,
    WRITE_CONFIRMATION_TTL_MINUTES,
)


# ============================================================
# pendingWrite 时钟工具
# ============================================================
def _parse_iso(s: str) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def _is_expired(pending: PendingWrite, now: datetime) -> bool:
    exp = _parse_iso(pending.expires_at)
    return exp is not None and now > exp


def _resolve_previous_pending(state: AgentGraphState) -> PendingWrite | None:
    """从 previous_state (云函数回传) 里恢复上一轮的 pendingWrite。"""
    prev = state.get("input", {}).get("previous_state") or {}
    pw = prev.get("pendingWrite")
    if not pw or not isinstance(pw, dict):
        return None
    try:
        # type/status 可能是字符串, 转 enum (兼容云函数回传的纯 JSON)
        pw_type = pw.get("type", "")
        if isinstance(pw_type, str):
            pw_type = PendingWriteType(pw_type)
        pw_status = pw.get("status", "")
        if isinstance(pw_status, str):
            pw_status = PendingWriteStatus(pw_status)
        return PendingWrite(
            id=pw.get("id", ""),
            type=pw_type,
            status=pw_status,
            data=pw.get("data", {}) or {},
            summary_for_user=pw.get("summaryForUser", "") or pw.get("summary_for_user", ""),
            expires_at=pw.get("expiresAt", "") or pw.get("expires_at", ""),
            created_at=pw.get("createdAt", "") or pw.get("created_at", ""),
        )
    except Exception:  # noqa: BLE001
        return None


# ============================================================
# 节点 1: intent_router  (规则主路径 + LLM 兜底)
# ============================================================
async def node_intent_router(state: AgentGraphState) -> dict[str, Any]:
    inp = state.get("input", {})
    message = inp.get("message", "")
    images = inp.get("images") or inp.get("image_data") or []
    has_images = bool(images)
    pending = _resolve_previous_pending(state)
    pending_exists = bool(pending and pending.is_waiting())

    # 0. 输入门禁 (M3): 空/过长 -> 直接 UNSUPPORTED + 标记 guardrail
    trace = state.get("trace", [])
    guard = input_guardrail(message if not has_images else (message or "图片输入"))
    if not guard["allowed"]:
        return {
            "intent": AgentIntent.UNSUPPORTED,
            "intent_confidence": 1.0,
            "slots": {},
            "previous_pending": pending,
            "guardrail_result": guard,
            "model_reply": guard.get("reply", ""),
            "trace": trace + [{"stage": "intent_router.guardrail_rejected", "data": {"reason": guard.get("reason")}}],
        }

    # 1. 规则主路径
    guess: IntentGuess | None = recognize_intent_rule(
        message, has_images=has_images, pending_write_exists=pending_exists
    )

    # 2. 规则没把握 -> 调 LLM router (fast 模型)
    if guess is None:
        settings = get_settings()
        if settings.llm_configured:
            from app.llm.provider import build_fast_llm
            try:
                llm = build_fast_llm(settings, temperature=0.0)
                guess = await recognize_intent_llm(
                    message, has_images=has_images, llm=llm,
                )
            except Exception:  # noqa: BLE001 - LLM router 失败降级
                guess = None

    # 3. 最终兜底
    if guess is None:
        guess = IntentGuess(AgentIntent.UNSUPPORTED, 0.5, "no_match_m1_fallback")

    # 4. parse slots (部分意图在路由后立即需要, 如 UNSUPPORTED 不需要)
    slots: dict[str, Any] = {}
    if guess.intent not in (AgentIntent.CONFIRM_WRITE, AgentIntent.CANCEL_WRITE, AgentIntent.UNSUPPORTED):
        now = _resolve_now(state)
        slots = parse_slots(guess.intent, message, has_images=has_images, now=now)

    trace = state.get("trace", []) + [{
        "stage": "intent_router",
        "data": {"intent": guess.intent.value, "confidence": guess.confidence, "reason": guess.reason},
    }]

    return {
        "intent": guess.intent,
        "intent_confidence": guess.confidence,
        "slots": slots,
        "previous_pending": pending,  # 暂存, write_handler/finalize 会用
        "trace": trace,
    }


def _resolve_now(state: AgentGraphState) -> datetime:
    raw = state.get("input", {}).get("now")
    if raw:
        dt = _parse_iso(raw) if isinstance(raw, str) else None
        if dt:
            return dt
    return datetime.now(timezone.utc)


# ============================================================
# 路由分支
# ============================================================
def route_after_intent(state: AgentGraphState) -> str:
    intent = state.get("intent")
    if intent in (AgentIntent.CONFIRM_WRITE, AgentIntent.CANCEL_WRITE):
        return "write_handler"
    if intent == AgentIntent.UNSUPPORTED:
        return "finalize"
    return "completer"


# ============================================================
# 节点 2: completer  (复用 llm_completer)
# ============================================================
async def node_completer(state: AgentGraphState) -> dict[str, Any]:
    # 把暂存的 previous_pending 透传, completer 可能需要参考 (多轮修改)
    prev_pending = state.get("previous_pending")
    out = await _node_completer(state)

    # completer 抛了 provider_error -> 透传, finalize 用 draft reply 兜底
    if out.get("_provider_error"):
        return out

    # 如果 completer 没构造出 pending, 但意图是修改类, 尝试用 previous 的 pending
    if out.get("pending_write") is None and prev_pending and prev_pending.is_waiting():
        if state.get("intent") == AgentIntent.TRAINING_PLAN_UPDATE:
            # 多轮修改: 沿用上一轮 pending, 只更新 slots 衍生的 data
            slots = out.get("slots", {})
            new_pending = subagents.build_training_plan_pending(slots, "update")
            out["pending_write"] = new_pending
    return out


# ============================================================
# 节点 3: write_handler  (确认/取消)
# ============================================================
async def node_write_handler(state: AgentGraphState) -> dict[str, Any]:
    """处理 CONFIRM_WRITE / CANCEL_WRITE。

    agent-service 不直接写库, 只做 pendingWrite 状态迁移:
      - CONFIRM + 有效 pending  -> status=confirmed (云函数侧据此前缀实际落库)
      - CONFIRM + 过期          -> status=expired
      - CONFIRM + 无 pending    -> 仍 status=None, finalize 给提示
      - CANCEL                  -> status=cancelled
    """
    intent = state.get("intent")
    pending = state.get("previous_pending")
    now = _resolve_now(state)
    trace = state.get("trace", [])

    if intent == AgentIntent.CANCEL_WRITE:
        if pending and pending.is_waiting():
            pending.status = PendingWriteStatus.CANCELLED
            trace = trace + [{"stage": "write.cancelled", "data": {"id": pending.id}}]
            return {
                "pending_write": pending,
                "confirmed_by_user": False,
                "model_reply": "已取消这条待确认写入，未写入任何数据。",
                "response_mode": ResponseMode.SHORT_CIRCUIT,
                "trace": trace,
            }
        trace = trace + [{"stage": "write.cancel_noop", "data": {}}]
        return {
            "pending_write": None,
            "model_reply": "当前没有需要取消的待确认写入项。",
            "response_mode": ResponseMode.SHORT_CIRCUIT,
            "trace": trace,
        }

    # CONFIRM_WRITE
    if not pending or pending.status in (PendingWriteStatus.CONFIRMED, PendingWriteStatus.CANCELLED):
        trace = trace + [{"stage": "write.confirm_noop", "data": {"status": pending.status.value if pending else None}}]
        return {
            "pending_write": pending,
            "confirmed_by_user": False,
            "model_reply": "当前没有等待确认的写入项。请先告诉我你要记录或修改的健康信息。",
            "response_mode": ResponseMode.SHORT_CIRCUIT,
            "trace": trace,
        }

    if _is_expired(pending, now):
        pending.status = PendingWriteStatus.EXPIRED
        trace = trace + [{"stage": "write.expired", "data": {"id": pending.id}}]
        return {
            "pending_write": pending,
            "confirmed_by_user": False,
            "model_reply": "这条待确认写入已经过期。请重新发送要记录的内容，我会重新生成待确认项。",
            "response_mode": ResponseMode.SHORT_CIRCUIT,
            "trace": trace,
        }

    # 状态置 confirmed (实际落库由云函数据此执行)
    pending.status = PendingWriteStatus.CONFIRMED
    reply_map = {
        "diet_log": "已记录到饮食记录。",
        "training_log": "已记录到训练记录。",
        "training_plan": "已保存训练计划。",
        "body_metric": "已记录身体数据。",
        "user_profile": "已更新用户画像。",
    }
    reply = reply_map.get(pending.type.value, "已完成写入。")
    trace = trace + [{"stage": "write.confirmed", "data": {"id": pending.id, "type": pending.type.value}}]
    return {
        "pending_write": pending,
        "confirmed_by_user": True,
        "model_reply": reply,
        "response_mode": ResponseMode.SHORT_CIRCUIT,
        "trace": trace,
    }


# ============================================================
# 节点 4: finalize
# ============================================================
async def node_finalize(state: AgentGraphState) -> dict[str, Any]:
    intent = state.get("intent", AgentIntent.UNSUPPORTED)
    pending = state.get("pending_write")
    model_reply = state.get("model_reply", "") or ""

    # provider_error 兜底
    if state.get("_provider_error"):
        from app.core.exceptions import ProviderError
        err: ProviderError = state["_provider_error"]
        model_reply = err.render_user_message()
        pending = None

    fallback_map = {
        AgentIntent.UNSUPPORTED: _unsupported_reply(),
        AgentIntent.CONFIRM_WRITE: "未找到待确认的内容。请先描述一条饮食或训练记录再确认。",
        AgentIntent.CANCEL_WRITE: "已取消。",
    }
    reply = model_reply.strip() or fallback_map.get(intent, "") or "我需要更多信息才能继续处理。"

    confirmed = bool(state.get("confirmed_by_user"))
    answer = build_answer(
        intent=intent,
        reply=reply,
        pending_write=pending,
        validation_errors=[],
        model="agent-service-m3",
        request_id=state.get("input", {}).get("client_message_id", ""),
    )

    # Memory (M3): 记录本轮短期记忆 + pendingWrite 的 memory 分类
    from app.memory import append_turn
    short_term = append_turn(
        state.get("input", {}).get("history") if isinstance(state.get("input", {}).get("history"), list) else None,
        state.get("input", {}).get("message", ""),
        reply,
    )
    memory_updates = classify_memory_update(pending)

    return {
        "answer": answer,
        "short_term_memory": short_term,
        "memory_updates": memory_updates,
        "trace": state.get("trace", []) + [
            {"stage": "finalize", "data": {
                "intent": intent.value, "confirmed": confirmed,
                "memory_updates": len(memory_updates),
            }}
        ],
    }


# ============================================================
# 构造图
# ============================================================
def build_fitness_graph():
    """构造并返回编译后的 fitness agent 图 (M2)。"""
    graph = StateGraph(AgentGraphState)

    graph.add_node("intent_router", node_intent_router)
    graph.add_node("write_handler", node_write_handler)
    graph.add_node("completer", node_completer)
    graph.add_node("finalize", node_finalize)

    graph.add_edge(START, "intent_router")
    graph.add_conditional_edges(
        "intent_router",
        route_after_intent,
        {
            "write_handler": "write_handler",
            "finalize": "finalize",
            "completer": "completer",
        },
    )
    graph.add_edge("write_handler", "finalize")
    graph.add_edge("completer", "finalize")
    graph.add_edge("finalize", END)

    return graph.compile()


__all__ = ["build_fitness_graph"]
