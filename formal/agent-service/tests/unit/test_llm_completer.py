"""llm_completer 节点单元测试 — mock LLM, 验证节点逻辑分支.

覆盖:
  - LLM 返回合法 JSON -> 用模型 reply
  - LLM 返回非 JSON -> 用原文或 draft 兜底
  - LLM 抛 ProviderError -> 透传 _provider_error
  - LLM 抛其它异常 -> draft reply 兜底
  - short_circuit 意图 -> 不调 LLM
  - llm 未配置 -> draft reply
"""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.exceptions import ProviderError
from app.nodes.llm_completer import _extract_json_object, _strip_markdown_json, node_completer
from app.types.agent_types import AgentIntent, ResponseMode


# ---------- JSON 解析工具 ----------
def test_strip_markdown_json_plain():
    assert _strip_markdown_json('{"a":1}') == '{"a":1}'


def test_strip_markdown_json_wrapped():
    assert _strip_markdown_json('```json\n{"a":1}\n```') == '{"a":1}'


def test_extract_json_object_plain():
    assert _extract_json_object('{"answer":"hi"}') == {"answer": "hi"}


def test_extract_json_object_with_prose():
    assert _extract_json_object('结果如下 {"answer":"hi"} 完成') == {"answer": "hi"}


def test_extract_json_object_invalid():
    assert _extract_json_object("no json") is None


def test_extract_json_object_none():
    assert _extract_json_object("") is None


# ---------- node_completer ----------
def _make_state(message="午餐吃了鸡胸肉", intent=AgentIntent.DIET_RECORD, **kw):
    base = {
        "input": {"user_id": "u1", "message": message},
        "intent": intent,
        "trace": [],
    }
    base.update(kw)
    return base


@pytest.mark.asyncio
async def test_completer_short_circuit_no_llm(monkeypatch):
    # DIET_RECORD 是 short_circuit 意图, 不应调 LLM
    from app.nodes import llm_completer
    monkeypatch.setattr(llm_completer, "build_model_for_request", MagicMock())
    state = _make_state(intent=AgentIntent.DIET_RECORD)
    out = await node_completer(state)
    assert out["response_mode"] == ResponseMode.SHORT_CIRCUIT
    assert "鸡胸肉" in out["model_reply"]
    assert out["pending_write"] is not None


@pytest.mark.asyncio
async def test_completer_llm_not_configured_uses_draft(monkeypatch):
    # llm_configured=False -> 走 draft reply
    from app.core import get_settings
    get_settings.cache_clear()
    monkeypatch.setenv("MIMO_API_KEY", "")
    try:
        state = _make_state(message="减脂期怎么吃", intent=AgentIntent.DIET_SUGGESTION)
        out = await node_completer(state)
        assert out["model_reply"]  # 有兜底回复
        # llm 未配置不应产生 provider_error (走的是 llm_skipped 分支)
        assert "_provider_error" not in out
    finally:
        get_settings.cache_clear()
        monkeypatch.delenv("MIMO_API_KEY", raising=False)


@pytest.mark.asyncio
async def test_completer_call_model_success(monkeypatch):
    # DIET_SUGGESTION -> CALL_MODEL; mock LLM 返回 JSON
    mock_resp = MagicMock()
    mock_resp.content = '{"answer":"建议多吃蛋白质"}'
    mock_resp.response_metadata = {"model_name": "mimo-v2.5"}

    mock_llm = MagicMock()
    mock_llm.ainvoke = AsyncMock(return_value=mock_resp)

    from app.core import get_settings
    get_settings.cache_clear()
    monkeypatch.setenv("MIMO_API_KEY", "test-key")
    try:
        from app.nodes import llm_completer
        monkeypatch.setattr(llm_completer, "build_model_for_request", lambda *a, **k: mock_llm)
        state = _make_state(message="减脂期怎么吃", intent=AgentIntent.DIET_SUGGESTION)
        out = await node_completer(state)
        assert "蛋白质" in out["model_reply"]
        assert out["response_mode"] == ResponseMode.CALL_MODEL
    finally:
        get_settings.cache_clear()
        monkeypatch.delenv("MIMO_API_KEY", raising=False)


@pytest.mark.asyncio
async def test_completer_call_model_non_json_uses_raw(monkeypatch):
    # LLM 返回纯文本 (非 JSON) -> 用原文当 reply
    mock_resp = MagicMock()
    mock_resp.content = "建议你每天摄入 1.5g/kg 蛋白质"
    mock_resp.response_metadata = {}

    mock_llm = MagicMock()
    mock_llm.ainvoke = AsyncMock(return_value=mock_resp)

    from app.core import get_settings
    get_settings.cache_clear()
    monkeypatch.setenv("MIMO_API_KEY", "test-key")
    try:
        from app.nodes import llm_completer
        monkeypatch.setattr(llm_completer, "build_model_for_request", lambda *a, **k: mock_llm)
        state = _make_state(message="减脂期怎么吃", intent=AgentIntent.DIET_SUGGESTION)
        out = await node_completer(state)
        assert "蛋白质" in out["model_reply"]
    finally:
        get_settings.cache_clear()
        monkeypatch.delenv("MIMO_API_KEY", raising=False)


@pytest.mark.asyncio
async def test_completer_provider_error_propagates(monkeypatch):
    mock_llm = MagicMock()
    mock_llm.ainvoke = AsyncMock(side_effect=ProviderError("timeout", kind=ProviderError.TIMEOUT))

    from app.core import get_settings
    get_settings.cache_clear()
    monkeypatch.setenv("MIMO_API_KEY", "test-key")
    try:
        from app.nodes import llm_completer
        monkeypatch.setattr(llm_completer, "build_model_for_request", lambda *a, **k: mock_llm)
        state = _make_state(message="减脂期怎么吃", intent=AgentIntent.DIET_SUGGESTION)
        out = await node_completer(state)
        assert out.get("_provider_error") is not None
        # 仍要有 draft reply 兜底
        assert out["model_reply"]
    finally:
        get_settings.cache_clear()
        monkeypatch.delenv("MIMO_API_KEY", raising=False)


@pytest.mark.asyncio
async def test_completer_generic_exception_falls_back(monkeypatch):
    mock_llm = MagicMock()
    mock_llm.ainvoke = AsyncMock(side_effect=RuntimeError("network"))

    from app.core import get_settings
    get_settings.cache_clear()
    monkeypatch.setenv("MIMO_API_KEY", "test-key")
    try:
        from app.nodes import llm_completer
        monkeypatch.setattr(llm_completer, "build_model_for_request", lambda *a, **k: mock_llm)
        state = _make_state(message="减脂期怎么吃", intent=AgentIntent.DIET_SUGGESTION)
        out = await node_completer(state)
        # 不抛, 用 draft reply
        assert out["model_reply"]
        assert "_provider_error" not in out
    finally:
        get_settings.cache_clear()
        monkeypatch.delenv("MIMO_API_KEY", raising=False)


@pytest.mark.asyncio
async def test_completer_diet_record_produces_pending(monkeypatch):
    # 即使是 short_circuit, 也要出 pendingWrite
    state = _make_state(message="午餐吃了鸡胸肉", intent=AgentIntent.DIET_RECORD)
    out = await node_completer(state)
    assert out["pending_write"] is not None
    assert out["pending_write"].type.value == "diet_log"


@pytest.mark.asyncio
async def test_completer_training_plan_update_pending(monkeypatch):
    state = _make_state(message="深蹲改成6组", intent=AgentIntent.TRAINING_PLAN_UPDATE)
    out = await node_completer(state)
    assert out["pending_write"] is not None
    assert out["pending_write"].data["operation"] == "update"
