# PendingWrite & Answer <-> 前端协议适配器
#
# 这是迁移的"协议合同"：
#   1. proposal_from_pending_write 严格复刻 miniprogram_adapter.proposalFromPendingWrite
#   2. enforce_answer_contract 严格复刻 answer_contract.enforceAnswerContract
# 协议不变 => 前端 0 改动 + 云函数仅做转发.

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from app.adapters.answer_models import (
    AgentState,
    Answer,
    AnswerPayload,
    AnswerSafety,
    Proposal,
)
from app.types.agent_types import (
    AgentIntent,
    PendingWriteStatus,
    PendingWriteType,
    ResponseMode,
    SUPPORTED_CAPABILITIES,
)


# ============================================================
# PendingWrite 数据类 (与原 harness pendingWrite 结构一致)
# ============================================================
@dataclass
class PendingWrite:
    """对应原 harness 内部的 pendingWrite 对象。"""

    id: str
    type: PendingWriteType
    status: PendingWriteStatus
    data: dict[str, Any] = field(default_factory=dict)
    summary_for_user: str = ""
    expires_at: str = ""  # ISO 时间
    created_at: str = ""

    def is_waiting(self) -> bool:
        return self.status == PendingWriteStatus.WAITING_CONFIRM

    def is_expired(self, now_iso: str) -> bool:
        # 由调用方判断; 留接口便于将来注入时钟
        return bool(self.expires_at) and self.expires_at < now_iso


# ============================================================
# 类型/标题映射 - 对应原 answerType / answerTitle
# ============================================================
def answer_type(intent: AgentIntent) -> str:
    if intent in (AgentIntent.DIET_RECORD, AgentIntent.DIET_SUGGESTION):
        return "diet"
    if intent in (
        AgentIntent.TRAINING_RECORD,
        AgentIntent.TRAINING_PLAN_CREATE,
        AgentIntent.TRAINING_PLAN_UPDATE,
    ):
        return "training"
    return "general"


_ANSWER_TITLES: dict[AgentIntent, str] = {
    AgentIntent.DIET_RECORD: "饮食记录确认",
    AgentIntent.DIET_SUGGESTION: "饮食建议",
    AgentIntent.TRAINING_PLAN_CREATE: "训练计划确认",
    AgentIntent.TRAINING_RECORD: "训练记录确认",
    AgentIntent.TRAINING_PLAN_UPDATE: "训练计划修改确认",
    AgentIntent.BODY_ANALYSIS: "身体数据分析",
    AgentIntent.CONFIRM_WRITE: "写入结果",
    AgentIntent.CANCEL_WRITE: "已取消",
    AgentIntent.UNSUPPORTED: "暂不支持",
}


def answer_title(intent: AgentIntent) -> str:
    return _ANSWER_TITLES.get(intent, "AI 教练")


# ============================================================
# Proposal 从 PendingWrite 构造 - 对应原 proposalFromPendingWrite
# ============================================================
def proposal_from_pending_write(pending: PendingWrite | None) -> Proposal | None:
    """把 harness 内部 pendingWrite 转成前端可渲染的 Proposal。"""
    if not pending or not pending.is_waiting():
        return None

    data = pending.data or {}
    summary = pending.summary_for_user or ""
    pid = pending.id

    if pending.type == PendingWriteType.DIET_LOG:
        return Proposal(
            id=pid,
            type="dietLog",
            status="pending",
            summary=summary or "将这条饮食信息写入记录",
            payload={
                "date": data.get("date"),
                "meal": data.get("meal", ""),
                "items": data.get("items", []),
                "source": data.get("source", "chat"),
                "harnessWriteType": pending.type.value,
                "pendingWriteId": pid,
            },
        )

    if pending.type == PendingWriteType.TRAINING_LOG:
        items = data.get("items", [])
        exercises = []
        for idx, item in enumerate(items):
            sub = "，".join(
                s
                for s in (
                    f"{item['sets']} 组" if item.get("sets") else "",
                    f"每组 {item['reps']} 次" if item.get("reps") else "",
                    f"{item['weightKg']} kg" if item.get("weightKg") is not None else "",
                    f"{item['durationMin']} 分钟" if item.get("durationMin") else "",
                )
                if s
            )
            reps_disp = (
                str(item.get("reps"))
                if item.get("reps") is not None
                else (f"{item['durationMin']}分钟" if item.get("durationMin") else "")
            )
            exercises.append(
                {
                    "id": f"{pid}-{idx + 1}",
                    "name": item.get("exerciseName") or "训练动作",
                    "subtitle": sub,
                    "sets": [
                        {
                            "setIndex": 1,
                            "weight": (
                                "" if item.get("weightKg") is None else str(item.get("weightKg"))
                            ),
                            "reps": reps_disp,
                            "restSeconds": 60,
                        }
                    ],
                }
            )
        return Proposal(
            id=pid,
            type="workoutPlan",
            status="pending",
            summary=summary or "将这条训练信息写入训练记录",
            payload={
                "date": data.get("date"),
                "operation": "log",
                "writeMode": "append",
                "planName": "训练记录",
                "exercises": exercises,
                "harnessWriteType": pending.type.value,
                "pendingWriteId": pid,
            },
        )

    if pending.type == PendingWriteType.TRAINING_PLAN:
        plan_payload = dict(data)
        plan_payload["writeMode"] = (
            "replace" if plan_payload.get("operation") == "update"
            else plan_payload.get("writeMode", "week")
        )
        plan_payload["harnessWriteType"] = pending.type.value
        plan_payload["pendingWriteId"] = pid
        return Proposal(
            id=pid,
            type="workoutPlan",
            status="pending",
            summary=summary or "将训练计划写入记录",
            payload=plan_payload,
        )

    if pending.type == PendingWriteType.BODY_METRIC:
        return Proposal(
            id=pid,
            type="profilePatch",
            status="pending",
            summary=summary or "将身体数据写入记录",
            payload={
                "date": data.get("date"),
                "profilePatch": data.get("metrics") or {},
                "source": data.get("source", "chat"),
                "harnessWriteType": pending.type.value,
                "pendingWriteId": pid,
            },
        )

    if pending.type == PendingWriteType.USER_PROFILE:
        return Proposal(
            id=pid,
            type="profilePatch",
            status="pending",
            summary=summary or "更新用户画像",
            payload={
                "profilePatch": data.get("profilePatch") or {},
                "source": data.get("source", "chat"),
                "harnessWriteType": pending.type.value,
                "pendingWriteId": pid,
            },
        )

    return None


# ============================================================
# enforce_answer_contract - 复刻 answer_contract.enforceAnswerContract, 并修复原缺陷
# 注: 原 Node 正则 `已(完成|记录|保存|写入|更新)` 不能匹配 "已经保存" 这种插入"经"字的变体,
# 导致模型可以撒谎式宣称 "我已经保存了你的早餐" 而不被洗掉. 迁移时修正 (不改字面量, 只加强).
# ============================================================
_WRITE_DONE_PATTERN = re.compile(
    r"已(?:经)?(完成|记录|保存|写入|更新)|保存成功|记录成功|写入成功"
)
_CONFIRM_PATTERN = re.compile(r"确认|核对|保存|写入")
_UNSUPPORTED_EXPANSION_PATTERN = re.compile(
    r"(论文|代码如下|旅游路线|景点|买入|卖出|合同条款|开奖号码|import\s+)",
    re.IGNORECASE,
)


def _remove_premature_write_claim(content: str) -> str:
    # 复刻原 removePrematureWriteClaim, 容忍 "已(经)?保存" 变体
    content = re.sub(
        r"已(?:经)?(完成|记录|保存|写入|更新)[^。！？\n]*(。|！|？)?", "", content or ""
    )
    content = re.sub(r"(保存|记录|写入)成功[^。！？\n]*(。|！|？)?", "", content)
    return content.strip()


def _unsupported_reply() -> str:
    caps = "、".join(SUPPORTED_CAPABILITIES)
    return f"抱歉，我目前只支持：{caps}。其他问题(如天气、股票、闲聊、写文章)我无法回答。"


def enforce_answer_contract(
    *,
    answer: Answer,
    intent: AgentIntent,
    pending_write: PendingWrite | None,
    confirmed_by_user: bool,
    fallback_reply: str = "",
) -> Answer:
    """在 answer 出网关前, 对内容做安全清洗 - 对应原 enforceAnswerContract。"""
    violations: list[str] = []
    content = (answer.content or "").strip()
    payload = answer.payload.model_copy()

    # 1. UNSUPPORTED 内容越界
    if intent == AgentIntent.UNSUPPORTED:
        if _UNSUPPORTED_EXPANSION_PATTERN.search(content) or "只支持" not in content:
            violations.append("UNSUPPORTED_SCOPE_EXPANSION")
            content = _unsupported_reply()

    # 2. 有待确认 pendingWrite 时, 禁止宣称"已保存"
    has_waiting = bool(pending_write and pending_write.is_waiting())
    if has_waiting:
        if _WRITE_DONE_PATTERN.search(content):
            violations.append("PREMATURE_WRITE_CLAIM")
            content = _remove_premature_write_claim(content)
        if not _CONFIRM_PATTERN.search(content):
            violations.append("MISSING_CONFIRMATION_PROMPT")
            summary = pending_write.summary_for_user if pending_write else ""
            tail = (
                f"我已生成待确认项：{summary}。请核对后再确认保存。" if summary else
                "我已生成待确认项。请核对后再确认保存。"
            )
            content = f"{content}\n\n{tail}".strip()

    # 3. 无 pendingWrite 且未确认, 却宣称已保存 - 删除
    if (
        not has_waiting
        and not confirmed_by_user
        and intent != AgentIntent.CONFIRM_WRITE
        and _WRITE_DONE_PATTERN.search(content)
    ):
        violations.append("UNCONFIRMED_WRITE_CLAIM")
        content = _remove_premature_write_claim(content)

    # 4. 内容被洗空 -> 兜底
    if not content:
        violations.append("EMPTY_AFTER_CONTRACT_REPAIR")
        content = fallback_reply or "我需要更多信息才能继续处理。"

    contract = {"passed": len(violations) == 0, "violations": violations}
    payload_map = payload.model_dump(by_alias=True)
    payload_map["answerContract"] = contract
    new_payload = AnswerPayload.model_validate(payload_map)

    new_safety = AnswerSafety(
        level=answer.safety.level,
        message=answer.safety.message,
    )
    new_safety.answerContract = contract  # type: ignore[attr-defined]

    return Answer(
        type=answer.type,
        title=answer.title,
        content=content,
        payload=new_payload,
        memory=answer.memory,
        safety=new_safety,
        model=answer.model,
        request_id=answer.request_id,
    )


# ============================================================
# high-level 把内部 AgentTurnResult 转 Answer
# ============================================================
def should_short_circuit(response_mode: ResponseMode) -> bool:
    return response_mode == ResponseMode.SHORT_CIRCUIT


def build_answer(
    *,
    intent: AgentIntent,
    reply: str,
    pending_write: PendingWrite | None,
    validation_errors: list[str] | None = None,
    model: str = "agent-service",
    request_id: str = "",
    safety_level: str = "none",
) -> Answer:
    """从内部 turn 结果合成一个对外的 Answer (含 contract 修复)。"""
    proposal = proposal_from_pending_write(pending_write)
    agent_state = AgentState(
        currentTask={
            "intent": intent.value,
            "step": "awaiting_confirmation" if proposal else "answered",
        },
        pendingWrite=(
            {
                "id": pending_write.id,
                "type": pending_write.type.value,
                "status": pending_write.status.value,
                "data": pending_write.data,
                "summaryForUser": pending_write.summary_for_user,
            }
            if pending_write
            else None
        ),
        validationResult={
            "passed": not bool(validation_errors),
            "errors": validation_errors or [],
        },
    )

    payload = AnswerPayload(
        proposals=[proposal] if proposal else [],
        agentState=agent_state,
    )

    base = Answer(
        type=answer_type(intent),  # type: ignore[arg-type]
        title=answer_title(intent),
        content=reply,
        payload=payload,
        model=model,
        request_id=request_id,
        safety=AnswerSafety(level=safety_level, message="；".join(validation_errors or [])),
    )

    return enforce_answer_contract(
        answer=base,
        intent=intent,
        pending_write=pending_write,
        confirmed_by_user=False,
        fallback_reply=reply,
    )


__all__ = [
    "PendingWrite",
    "answer_type",
    "answer_title",
    "proposal_from_pending_write",
    "enforce_answer_contract",
    "should_short_circuit",
    "build_answer",
]
