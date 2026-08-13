"""端到端整合测试 - 跑通整个图.

M1 阶段: 验证图能编译、能 ainvoke, 关键意图能 short-circuit 出 answer, 字段完整.
这是 M2 接入 LLM 后回归的基石.
"""

import pytest

from app.graph import build_fitness_graph
from app.graph.state import TurnInput


@pytest.fixture(scope="module")
def graph():
    return build_fitness_graph()


def _make_turn(message: str, **kw) -> TurnInput:
    base = {
        "user_id": "u1",
        "session_id": "s1",
        "message": message,
    }
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


@pytest.mark.asyncio
async def test_graph_compiles_and_runs(graph):
    state = await _run(graph, "确认")
    assert "answer" in state
    assert state["answer"] is not None


@pytest.mark.asyncio
async def test_unsupported_intent_short_circuits(graph):
    state = await _run(graph, "帮我写论文")
    assert state["intent"].value == "UNSUPPORTED"
    answer = state["answer"]
    # 出口修复: content 必须替换为"只支持"
    assert "只支持" in answer.content


@pytest.mark.asyncio
async def test_cancel_without_pending_noop(graph):
    # M2: 无 pendingWrite 时取消 -> write_handler 给出 noop 提示 (而非空喊"已取消")
    state = await _run(graph, "取消")
    assert state["intent"].value == "CANCEL_WRITE"
    assert "没有需要取消" in state["answer"].content


@pytest.mark.asyncio
async def test_cancel_with_pending_succeeds(graph):
    # 有 pendingWrite (云函数从 previous_state 带回) 时取消 -> 真"已取消"
    prev = {"pendingWrite": {
        "id": "pw-1", "type": "diet_log", "status": "waiting_confirm",
        "data": {}, "summaryForUser": "饮食记录：鸡胸肉",
    }}
    state = await _run(graph, "取消", previous_state=prev)
    assert state["intent"].value == "CANCEL_WRITE"
    assert "已取消" in state["answer"].content


@pytest.mark.asyncio
async def test_food_image_routes_through_completer(graph):
    # M2: completer 是真实节点, 不再是 stub
    state = await _run(graph, "这餐吃了啥", images=["data:image/png;base64,xxx"])
    assert state["intent"].value == "DIET_RECORD"
    # trace 中应有: intent_router -> completer.* -> finalize
    stages = [t["stage"] for t in state.get("trace", [])]
    assert "intent_router" in stages
    assert any(s.startswith("completer") for s in stages), stages
    assert "finalize" in stages
    # 仍然产出 answer
    assert state["answer"] is not None
