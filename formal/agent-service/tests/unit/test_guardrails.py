"""安全门禁测试 — input_guardrail / validate_tool_intent / validate_write_tool_call / scope_guardrail.

覆盖验收 §8 Proposal 协议 + §9 pendingWrite + §14 异常降级.
"""

import pytest

from app.guardrails import (
    input_guardrail,
    scope_guardrail,
    unsupported_reply,
    validate_tool_intent,
    validate_write_tool_call,
)
from app.types.agent_types import AgentIntent


# ---------- input_guardrail ----------
def test_input_guardrail_empty():
    r = input_guardrail("")
    assert r["allowed"] is False
    assert r["reason"] == "EMPTY_INPUT"
    assert r["reply"]


def test_input_guardrail_whitespace():
    r = input_guardrail("   ")
    assert r["allowed"] is False


def test_input_guardrail_none():
    r = input_guardrail(None)
    assert r["allowed"] is False


def test_input_guardrail_too_long():
    r = input_guardrail("x" * 1201)
    assert r["allowed"] is False
    assert r["reason"] == "INPUT_TOO_LONG"


def test_input_guardrail_ok():
    assert input_guardrail("午餐吃了鸡胸肉")["allowed"] is True


def test_input_guardrail_boundary_1200():
    assert input_guardrail("x" * 1200)["allowed"] is True


# ---------- unsupported_reply ----------
def test_unsupported_reply_lists_capabilities():
    r = unsupported_reply()
    assert "只支持" in r
    assert "饮食记录" in r
    assert "训练" in r


# ---------- validate_tool_intent ----------
def test_validate_tool_intent_unknown():
    r = validate_tool_intent(AgentIntent.DIET_RECORD, "nonexistent.tool")
    assert r["allowed"] is False
    assert r["reason"] == "UNKNOWN_TOOL"


def test_validate_tool_intent_diet_cannot_call_training():
    r = validate_tool_intent(AgentIntent.DIET_RECORD, "training.log.create")
    assert r["allowed"] is False
    assert r["reason"] == "DIET_CANNOT_CALL_TRAINING_TOOL"


def test_validate_tool_intent_training_cannot_call_diet():
    r = validate_tool_intent(AgentIntent.TRAINING_RECORD, "diet.log.create")
    assert r["allowed"] is False
    assert r["reason"] == "TRAINING_CANNOT_CALL_DIET_TOOL"


def test_validate_tool_intent_ok_same_domain():
    r = validate_tool_intent(AgentIntent.DIET_RECORD, "diet.log.create")
    assert r["allowed"] is True


def test_validate_tool_intent_ok_read_tool():
    r = validate_tool_intent(AgentIntent.TRAINING_RECORD, "user.profile.get")
    assert r["allowed"] is True


# ---------- validate_write_tool_call ----------
def test_validate_write_requires_confirmation():
    r = validate_write_tool_call({"name": "diet.log.create"}, confirmed_by_user=False)
    assert r["allowed"] is False
    assert r["reason"] == "WRITE_REQUIRES_CONFIRMATION"


def test_validate_write_allowed_when_confirmed():
    r = validate_write_tool_call({"name": "diet.log.create"}, confirmed_by_user=True)
    assert r["allowed"] is True


def test_validate_write_sensitive_requires_confirmation():
    r = validate_write_tool_call({"name": "user.profile.update"}, confirmed_by_user=False)
    assert r["allowed"] is False


def test_validate_write_read_tool_always_ok():
    r = validate_write_tool_call({"name": "user.profile.get"}, confirmed_by_user=False)
    assert r["allowed"] is True


def test_validate_write_unknown_tool():
    r = validate_write_tool_call({"name": "nope"}, confirmed_by_user=True)
    assert r["allowed"] is False


def test_validate_write_none_name():
    r = validate_write_tool_call({}, confirmed_by_user=True)
    assert r["allowed"] is False


# ---------- scope_guardrail ----------
def test_scope_guardrail_non_unsupported_passes():
    r = scope_guardrail(AgentIntent.DIET_RECORD, "随便说什么")
    assert r["allowed"] is True


def test_scope_guardrail_unsupported_no_expansion():
    r = scope_guardrail(AgentIntent.UNSUPPORTED, "我只支持饮食记录")
    assert r["allowed"] is True


def test_scope_guardrail_unsupported_expansion_caught():
    r = scope_guardrail(AgentIntent.UNSUPPORTED, "论文的步骤首先是确定主题")
    assert r["allowed"] is False
    assert r["reason"] == "UNSUPPORTED_ANSWER_EXPANDED"


def test_scope_guardrail_unsupported_code_expansion():
    r = scope_guardrail(AgentIntent.UNSUPPORTED, "代码可以这样写，建议你用 Python")
    assert r["allowed"] is False
