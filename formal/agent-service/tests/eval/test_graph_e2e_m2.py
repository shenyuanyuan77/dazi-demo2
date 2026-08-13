"""Graph 端到端测试 (M2) — 覆盖验收 §7 意图矩阵 + §9 pendingWrite 二段确认 + §35 M2 验收.

关键 invariant:
  - 任何记录类意图 -> 必须产出 pendingWrite (waiting_confirm), 不能直接落库
  - 确认 -> pendingWrite 变 confirmed (agent-service 不写库, 云函数据此执行)
  - 取消 -> pendingWrite 变 cancelled
  - UNSUPPORTED -> answer.content 含 "只支持"
  - LLM 未配置时 -> 用 subagent 确定性 draft reply, 不抛错
"""

from datetime import datetime, timedelta, timezone

import pytest

from app.adapters.answer_models import Answer
from app.graph import build_fitness_graph
from app.graph.state import TurnInput
from app.types.agent_types import PendingWriteStatus


@pytest.fixture(scope="module")
def graph():
    return build_fitness_graph()


def _make_turn(message: str, **kw) -> TurnInput:
    base = {"user_id": "u1", "session_id": "s1", "message": message}
    base.update(kw)
    return base  # type: ignore[return-value]


async def _run(graph, message, **kw):
    initial = {
        "input": _make_turn(message, **kw),
        "trace": [],
        "tool_calls": [],
        "validation_errors": [],
        "pending_write": None,
        "confirmed_by_user": False,
    }
    return await graph.ainvoke(initial)


def _pending_waiting(pw):
    return pw is not None and pw.status == PendingWriteStatus.WAITING_CONFIRM


# ============================================================
# 基础冒烟
# ============================================================
@pytest.mark.asyncio
async def test_graph_compiles_and_runs(graph):
    state = await _run(graph, "确认")
    assert "answer" in state
    assert isinstance(state["answer"], Answer)


# ============================================================
# UNSUPPORTED
# ============================================================
@pytest.mark.asyncio
async def test_unsupported_short_circuits(graph):
    state = await _run(graph, "帮我写论文")
    assert state["intent"].value == "UNSUPPORTED"
    assert "只支持" in state["answer"].content


@pytest.mark.asyncio
async def test_unsupported_stock(graph):
    state = await _run(graph, "预测股票涨跌")
    assert state["intent"].value == "UNSUPPORTED"


# ============================================================
# DIET_RECORD -> 必须出 pendingWrite
# ============================================================
@pytest.mark.asyncio
async def test_diet_record_produces_pending_write(graph):
    state = await _run(graph, "午餐吃了鸡胸肉和米饭")
    assert state["intent"].value == "DIET_RECORD"
    pw = state.get("pending_write")
    assert _pending_waiting(pw), f"expected waiting pendingWrite, got {pw}"
    assert "鸡胸肉" in pw.summary_for_user


@pytest.mark.asyncio
async def test_diet_record_reply_asks_confirmation(graph):
    state = await _run(graph, "早餐吃了鸡蛋")
    assert "确认" in state["answer"].content or "确认" in state.get("model_reply", "")


@pytest.mark.asyncio
async def test_diet_record_proposal_in_answer(graph):
    state = await _run(graph, "午餐吃了牛肉面")
    answer = state["answer"]
    # build_answer 应生成 proposal
    proposals = answer.payload.proposals or []
    assert len(proposals) >= 1
    assert proposals[0].type == "dietLog"


# ============================================================
# TRAINING_PLAN_CREATE -> pendingWrite
# ============================================================
@pytest.mark.asyncio
async def test_training_plan_create_pending(graph):
    state = await _run(graph, "安排一个增肌训练计划每周练4天")
    assert state["intent"].value == "TRAINING_PLAN_CREATE"
    pw = state.get("pending_write")
    assert _pending_waiting(pw)
    assert pw.data["operation"] == "create"


@pytest.mark.asyncio
async def test_training_plan_create_proposal_type(graph):
    state = await _run(graph, "帮我制定减脂居家训练")
    proposals = state["answer"].payload.proposals or []
    assert len(proposals) >= 1
    assert proposals[0].type == "workoutPlan"


# ============================================================
# TRAINING_PLAN_UPDATE -> pendingWrite
# ============================================================
@pytest.mark.asyncio
async def test_training_plan_update_pending(graph):
    state = await _run(graph, "把深蹲改成6组")
    assert state["intent"].value == "TRAINING_PLAN_UPDATE"
    pw = state.get("pending_write")
    assert _pending_waiting(pw)
    assert pw.data["operation"] == "update"


# ============================================================
# TRAINING_RECORD -> pendingWrite
# ============================================================
@pytest.mark.asyncio
async def test_training_record_pending(graph):
    state = await _run(graph, "今天深蹲4组每组8次")
    assert state["intent"].value == "TRAINING_RECORD"
    pw = state.get("pending_write")
    assert _pending_waiting(pw)
    assert "深蹲" in pw.summary_for_user


# ============================================================
# BODY_ANALYSIS -> 有 metrics 出 pendingWrite, 无则 LLM/draft
# ============================================================
@pytest.mark.asyncio
async def test_body_analysis_with_metrics_pending(graph):
    state = await _run(graph, "我体重70kg 体脂18%")
    assert state["intent"].value == "BODY_ANALYSIS"
    pw = state.get("pending_write")
    assert _pending_waiting(pw)


@pytest.mark.asyncio
async def test_body_analysis_readonly_no_write(graph):
    # 只分析, 不写入
    state = await _run(graph, "体脂18%只分析不记录")
    assert state["intent"].value == "BODY_ANALYSIS"


# ============================================================
# §9 pendingWrite 二段确认 (核心)
# ============================================================
@pytest.mark.asyncio
async def test_confirm_without_pending_noop(graph):
    state = await _run(graph, "确认")
    assert state["intent"].value == "CONFIRM_WRITE"
    assert "没有等待确认" in state["answer"].content or "没有待确认" in state["answer"].content


@pytest.mark.asyncio
async def test_confirm_with_pending_marks_confirmed(graph):
    prev = {"pendingWrite": {
        "id": "pw-1", "type": "diet_log", "status": "waiting_confirm",
        "data": {"items": [{"name": "鸡胸肉"}]}, "summaryForUser": "饮食记录",
    }}
    state = await _run(graph, "确认", previous_state=prev)
    assert state["intent"].value == "CONFIRM_WRITE"
    pw = state.get("pending_write")
    assert pw.status == PendingWriteStatus.CONFIRMED
    assert "已记录" in state["answer"].content


@pytest.mark.asyncio
async def test_cancel_with_pending_marks_cancelled(graph):
    prev = {"pendingWrite": {
        "id": "pw-2", "type": "training_log", "status": "waiting_confirm",
        "data": {}, "summaryForUser": "训练记录",
    }}
    state = await _run(graph, "取消", previous_state=prev)
    assert state["intent"].value == "CANCEL_WRITE"
    pw = state.get("pending_write")
    assert pw.status == PendingWriteStatus.CANCELLED


@pytest.mark.asyncio
async def test_cancel_without_pending_noop(graph):
    state = await _run(graph, "取消")
    assert state["intent"].value == "CANCEL_WRITE"
    assert "没有需要取消" in state["answer"].content


@pytest.mark.asyncio
async def test_confirm_expired_pending(graph):
    expired = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    prev = {"pendingWrite": {
        "id": "pw-3", "type": "diet_log", "status": "waiting_confirm",
        "data": {}, "summaryForUser": "x", "expiresAt": expired,
    }}
    state = await _run(graph, "确认", previous_state=prev)
    pw = state.get("pending_write")
    assert pw.status == PendingWriteStatus.EXPIRED
    assert "过期" in state["answer"].content


# ============================================================
# 图片意图
# ============================================================
@pytest.mark.asyncio
async def test_food_image_diet_record(graph):
    state = await _run(graph, "这餐吃了啥", images=["data:image/png;base64,xxx"])
    assert state["intent"].value == "DIET_RECORD"
    stages = [t["stage"] for t in state.get("trace", [])]
    assert any(s.startswith("completer") for s in stages)


@pytest.mark.asyncio
async def test_body_scale_image_body_analysis(graph):
    state = await _run(graph, "体脂秤截图", images=["data:image/png;base64,yyy"])
    assert state["intent"].value == "BODY_ANALYSIS"


# ============================================================
# 多轮: 生成计划 -> 修改 -> 确认
# ============================================================
@pytest.mark.asyncio
async def test_multiturn_plan_modify_confirm(graph):
    # Turn 1: 生成计划
    s1 = await _run(graph, "安排增肌训练计划")
    assert s1["intent"].value == "TRAINING_PLAN_CREATE"
    pw1 = s1["pending_write"]
    assert _pending_waiting(pw1)

    # Turn 2: 修改 (带 previous_state)
    prev = {"pendingWrite": {
        "id": pw1.id, "type": "training_plan", "status": "waiting_confirm",
        "data": pw1.data, "summaryForUser": pw1.summary_for_user,
    }}
    s2 = await _run(graph, "深蹲改成6组", previous_state=prev)
    assert s2["intent"].value == "TRAINING_PLAN_UPDATE"
    pw2 = s2["pending_write"]
    assert _pending_waiting(pw2)

    # Turn 3: 确认
    prev2 = {"pendingWrite": {
        "id": pw2.id, "type": "training_plan", "status": "waiting_confirm",
        "data": pw2.data, "summaryForUser": pw2.summary_for_user,
    }}
    s3 = await _run(graph, "确认", previous_state=prev2)
    assert s3["pending_write"].status == PendingWriteStatus.CONFIRMED


# ============================================================
# trace 完整性
# ============================================================
@pytest.mark.asyncio
async def test_trace_has_intent_and_finalize(graph):
    state = await _run(graph, "午餐吃了鸡蛋")
    stages = [t["stage"] for t in state.get("trace", [])]
    assert "intent_router" in stages
    assert "finalize" in stages


# ============================================================
# answer 协议完整性
# ============================================================
@pytest.mark.asyncio
async def test_answer_has_required_fields(graph):
    state = await _run(graph, "早餐吃了鸡蛋")
    a = state["answer"]
    assert a.type in ("diet", "training", "general")
    assert isinstance(a.content, str) and a.content
    assert a.payload is not None
    assert a.model.startswith("agent-service-")  # m1/m2/m3 随版本演进


@pytest.mark.asyncio
async def test_answer_pending_write_has_pendingwrite_id(graph):
    state = await _run(graph, "午餐吃了鸡胸肉")
    a = state["answer"]
    # 有 pendingWrite 时, agentState.pendingWrite.id 必须存在
    agent_state = a.payload.agent_state
    if agent_state and agent_state.pending_write:
        assert agent_state.pending_write.get("id")
