# 适配器 - 内部表示 <-> 对外 (小程序 answer 协议) 转换.

from app.adapters.answer_models import (
    AgentState,
    Answer,
    AnswerPayload,
    AnswerSafety,
    Proposal,
)
from app.adapters.miniprogram_adapter import (
    PendingWrite,
    answer_title,
    answer_type,
    build_answer,
    enforce_answer_contract,
    proposal_from_pending_write,
    should_short_circuit,
)

__all__ = [
    "AgentState",
    "Answer",
    "AnswerPayload",
    "AnswerSafety",
    "Proposal",
    "PendingWrite",
    "answer_title",
    "answer_type",
    "build_answer",
    "enforce_answer_contract",
    "proposal_from_pending_write",
    "should_short_circuit",
]
