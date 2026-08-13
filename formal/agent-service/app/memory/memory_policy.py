# app/memory/memory_policy.py
# 记忆策略 — 1:1 移植 Node memory_policy.js.
#
# 定义:
#   - 哪些字段属于 userProfile (长期, 经确认)
#   - episodicTargets: pendingWrite type -> 情节记忆存储目标
#   - sessionOnly: 只在当前 session 保留, 不入长期
#   - forbiddenLongTerm: 明确禁止写入长期记忆 (防止污染)
from __future__ import annotations

from types import MappingProxyType
from typing import Any

from app.types.agent_types import PendingWriteType


MEMORY_POLICY = MappingProxyType({
    "userProfile": (
        "heightCm", "weightKg", "goal", "dailyCalorieTarget",
        "dietPreferences", "dietAvoidances", "trainingFrequency",
        "availableEquipment", "weeklySchedule", "injuryHistory",
    ),
    "episodicTargets": MappingProxyType({
        "dietLogs": PendingWriteType.DIET_LOG,
        "trainingLogs": PendingWriteType.TRAINING_LOG,
        "trainingPlans": PendingWriteType.TRAINING_PLAN,
        "bodyMetrics": PendingWriteType.BODY_METRIC,
    }),
    "sessionOnly": (
        "temporaryClarification", "toolResult", "formatRepair", "unsupportedQuestion",
    ),
    "forbiddenLongTerm": (
        "toolFailure", "validationError", "unsupportedQuestion",
        "smallTalk", "unconfirmedWrite",
    ),
})


_TARGET_BY_TYPE = {
    PendingWriteType.USER_PROFILE: ("userProfile", "pending_update"),
    PendingWriteType.DIET_LOG: ("dietLogs", "pending_create"),
    PendingWriteType.TRAINING_LOG: ("trainingLogs", "pending_create"),
    PendingWriteType.TRAINING_PLAN: ("trainingPlans", "pending_upsert"),
    PendingWriteType.BODY_METRIC: ("bodyMetrics", "pending_create"),
}


def classify_memory_update(pending_write: Any) -> list[dict[str, Any]]:
    """把 pendingWrite 映射成 memory 更新指令 (均 requiresConfirmation)."""
    if pending_write is None:
        return []
    pw_type = getattr(pending_write, "type", None) or getattr(pending_write, "type", "")
    # 兼容 enum 与 str
    pw_type_val = pw_type.value if hasattr(pw_type, "value") else pw_type
    try:
        target, action = _TARGET_BY_TYPE[PendingWriteType(pw_type_val)]
    except (KeyError, ValueError):
        return []
    data = getattr(pending_write, "data", {}) or {}
    return [{"target": target, "action": action, "data": data, "requiresConfirmation": True}]


__all__ = ["MEMORY_POLICY", "classify_memory_update"]
