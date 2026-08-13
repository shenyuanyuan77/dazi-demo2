"""上下文选择器 + 状态存储测试.

覆盖验收 §37: context_selector 按意图选择上下文; state_store 多轮状态恢复.
"""

import pytest

from app.nodes.context_selector import CONTEXT_POLICY, select_context
from app.state import (
    add_error,
    add_memory_read,
    add_memory_write,
    add_tool_call,
    compact_state,
    create_initial_state,
)
from app.types.agent_types import AgentIntent


# ============================================================
# context_selector
# ============================================================
def test_context_policy_covers_all_intents():
    for intent in AgentIntent:
        assert intent in CONTEXT_POLICY, f"missing policy for {intent}"


def test_select_context_diet_record():
    state = {"shortTermMemory": [{"role": "user", "content": "hi"}], "userProfile": {"goal": "减脂"}}
    epi = {"dietLogs": [{"name": "鸡胸肉"}]}
    out = select_context(AgentIntent.DIET_RECORD, state, epi)
    assert "shortTermMemory" in out["data"]
    assert "todayDietLogs" in out["data"]
    # userProfile 不在 DIET_RECORD 的 keys 里 -> 不应出现
    assert "userProfile" not in out["data"]


def test_select_context_diet_suggestion_includes_profile():
    state = {"userProfile": {"goal": "增肌", "weightKg": 70}}
    epi = {"dietLogs": [], "trainingLogs": [{"name": "深蹲"}]}
    out = select_context(AgentIntent.DIET_SUGGESTION, state, epi)
    assert out["data"]["userProfile"]["goal"] == "增肌"
    assert "currentGoal" in out["data"]
    assert out["data"]["currentGoal"] == "增肌"


def test_select_context_training_plan_create():
    state = {"userProfile": {
        "goal": "增肌", "availableEquipment": "哑铃",
        "weeklySchedule": "周一三五", "injuryHistory": "无",
    }}
    out = select_context(AgentIntent.TRAINING_PLAN_CREATE, state)
    assert "哑铃" in out["data"]["availableEquipment"]


def test_select_context_body_analysis_trend():
    state = {"userProfile": {"goal": "减脂"}}
    epi = {"bodyMetrics": [{"weightKg": 70}, {"weightKg": 69}, {"weightKg": 68.5}]}
    out = select_context(AgentIntent.BODY_ANALYSIS, state, epi)
    assert len(out["data"]["latestBodyMetrics"]) == 3
    assert out["data"]["bodyMetricTrend"]["count"] == 3


def test_select_context_unsupported_only_procedural():
    state = {"proceduralMemory": ["rule1"], "userProfile": {"goal": "x"}}
    out = select_context(AgentIntent.UNSUPPORTED, state)
    assert "proceduralMemory" in out["data"]
    assert "userProfile" not in out["data"]


def test_select_context_drops_empty_values():
    state = {"userProfile": {}, "shortTermMemory": []}
    out = select_context(AgentIntent.DIET_RECORD, state)
    # 空的 profile/memory 不应进 data
    assert out["data"] == {} or "shortTermMemory" not in out["data"]


def test_select_context_confirm_uses_pending():
    state = {"pendingWrite": {"id": "pw-1"}}
    out = select_context(AgentIntent.CONFIRM_WRITE, state)
    assert out["data"]["pendingWrite"]["id"] == "pw-1"


def test_select_context_keys_returned():
    out = select_context(AgentIntent.DIET_RECORD, {})
    assert isinstance(out["keys"], list)
    assert "shortTermMemory" in out["keys"]


# ============================================================
# state_store
# ============================================================
def test_create_initial_state_basic():
    s = create_initial_state({"userId": "u1", "sessionId": "s1", "profile": {"goal": "减脂"}})
    assert s["userId"] == "u1"
    assert s["userProfile"]["goal"] == "减脂"
    assert s["toolCallHistory"] == []
    assert s["errorHistory"] == []


def test_create_initial_state_snake_case():
    s = create_initial_state({"user_id": "u2", "session_id": "s2"})
    assert s["userId"] == "u2"


def test_create_initial_state_history_truncated():
    history = [{"role": "user", "content": str(i)} for i in range(30)]
    s = create_initial_state({"history": history})
    assert len(s["shortTermMemory"]) <= 20


def test_add_error():
    s = create_initial_state({})
    add_error(s, {"code": "TEST_ERR", "message": "test"})
    assert len(s["errorHistory"]) == 1
    assert s["errorHistory"][0]["code"] == "TEST_ERR"
    assert "at" in s["errorHistory"][0]


def test_add_tool_call():
    s = create_initial_state({})
    add_tool_call(s, {"name": "diet.log.create", "ok": True})
    assert s["toolCallHistory"][0]["name"] == "diet.log.create"


def test_add_memory_read():
    s = create_initial_state({})
    add_memory_read(s, {"intent": "DIET_RECORD", "keys": ["userProfile"]})
    assert len(s["memoryReadHistory"]) == 1


def test_add_memory_write():
    s = create_initial_state({})
    add_memory_write(s, {"target": "dietLogs", "action": "confirmed"})
    assert s["memoryWriteHistory"][0]["target"] == "dietLogs"


def test_compact_state():
    s = create_initial_state({"userId": "u1"})
    add_tool_call(s, {"name": "x", "ok": True})
    add_error(s, {"code": "E"})
    s["lastIntent"] = "DIET_RECORD"
    compact = compact_state(s)
    assert compact["userId"] == "u1"
    assert compact["toolCallCount"] == 1
    assert compact["errorCount"] == 1
    assert compact["lastIntent"] == "DIET_RECORD"


# ============================================================
# 多轮状态恢复 (验收 §37)
# ============================================================
def test_multiturn_state_recovery():
    """模拟: 生成计划 -> 退出 -> 重新进入 -> 继续修改.

    验证 previous_state 里的 pendingWrite 能被 _resolve_previous_pending 还原.
    """
    from app.graph.fitness_graph import _resolve_previous_pending

    # Turn 1 产出的 pendingWrite (云函数存到 previous_state)
    pending_t1 = {
        "id": "pw-multi", "type": "training_plan", "status": "waiting_confirm",
        "data": {"operation": "create", "exercises": [{"name": "深蹲"}]},
        "summaryForUser": "增肌训练计划",
    }
    state_t2 = {"input": {"previous_state": {"pendingWrite": pending_t1}}}

    # Turn 2: 从 previous_state 恢复 pendingWrite
    recovered = _resolve_previous_pending(state_t2)
    assert recovered is not None
    assert recovered.id == "pw-multi"
    assert recovered.is_waiting()
    assert recovered.data["exercises"][0]["name"] == "深蹲"


def test_resolve_previous_pending_none_when_missing():
    from app.graph.fitness_graph import _resolve_previous_pending
    assert _resolve_previous_pending({"input": {}}) is None
    assert _resolve_previous_pending({"input": {"previous_state": {}}}) is None


def test_resolve_previous_pending_invalid_returns_none():
    from app.graph.fitness_graph import _resolve_previous_pending
    # 无效 type -> ValueError -> 返回 None
    bad = {"input": {"previous_state": {"pendingWrite": {"type": "bogus", "status": "x"}}}}
    assert _resolve_previous_pending(bad) is None
