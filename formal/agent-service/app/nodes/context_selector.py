# app/nodes/context_selector.py
# 上下文选择器 — 1:1 移植 Node context_policy.js.
#
# 职责: 按意图决定把哪些上下文 (profile/history/recent_logs/memory) 注入 prompt,
# 避免给短回答注入噪声 (eg. UNSUPPORTED 只需 proceduralMemory).
from __future__ import annotations

from types import MappingProxyType
from typing import Any

from app.types.agent_types import AgentIntent


CONTEXT_POLICY: MappingProxyType[AgentIntent, tuple[str, ...]] = MappingProxyType({
    AgentIntent.DIET_RECORD: ("shortTermMemory", "todayDietLogs"),
    AgentIntent.DIET_SUGGESTION: ("userProfile", "todayDietLogs", "todayTrainingLogs", "currentGoal"),
    AgentIntent.TRAINING_PLAN_CREATE: ("userProfile", "currentGoal", "availableEquipment", "weeklySchedule", "injuryHistory"),
    AgentIntent.TRAINING_RECORD: ("todayTrainingPlan", "recentTrainingLogs"),
    AgentIntent.TRAINING_PLAN_UPDATE: ("todayTrainingPlan", "recentTrainingPlans", "weeklySchedule"),
    AgentIntent.BODY_ANALYSIS: ("userProfile", "latestBodyMetrics", "bodyMetricTrend"),
    AgentIntent.CONFIRM_WRITE: ("pendingWrite",),
    AgentIntent.CANCEL_WRITE: ("pendingWrite",),
    AgentIntent.UNSUPPORTED: ("proceduralMemory",),
})


def select_context(
    intent: AgentIntent,
    state: dict[str, Any],
    episodic: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """根据意图选择上下文。返回 {keys, data}.

    state 期望含: userProfile / shortTermMemory / trainingPlans / pendingWrite / proceduralMemory
    episodic 期望含: dietLogs / trainingLogs / bodyMetrics
    """
    keys = CONTEXT_POLICY.get(intent, ())
    profile = state.get("userProfile") or {}
    epi = episodic or {}
    data_pool = {
        "shortTermMemory": state.get("shortTermMemory") or [],
        "userProfile": profile,
        "todayDietLogs": (epi.get("dietLogs") or [])[-6:],
        "todayTrainingLogs": (epi.get("trainingLogs") or [])[-6:],
        "recentTrainingLogs": (epi.get("trainingLogs") or [])[-10:],
        "recentTrainingPlans": state.get("trainingPlans") or [],
        "todayTrainingPlan": state.get("todayTrainingPlan"),
        "latestBodyMetrics": (epi.get("bodyMetrics") or [])[-3:],
        "bodyMetricTrend": {"count": len(epi.get("bodyMetrics") or [])},
        "currentGoal": profile.get("goal", ""),
        "availableEquipment": profile.get("availableEquipment", ""),
        "weeklySchedule": profile.get("weeklySchedule", ""),
        "injuryHistory": profile.get("injuryHistory", ""),
        "pendingWrite": state.get("pendingWrite"),
        "proceduralMemory": state.get("proceduralMemory") or [],
    }
    selected: dict[str, Any] = {}
    for key in keys:
        val = data_pool.get(key)
        if val not in (None, "", [], {}):
            selected[key] = val
    return {"keys": list(keys), "data": selected}


__all__ = ["CONTEXT_POLICY", "select_context"]
