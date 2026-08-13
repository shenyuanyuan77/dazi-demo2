"""验证枚举/常量与原 Node agent_types.js 的字面量 1:1 对齐."""

from app.types.agent_types import (
    CONFIRMATION_WORDS,
    CANCEL_WORDS,
    AgentIntent,
    PendingWriteStatus,
    PendingWriteType,
    SUPPORTED_CAPABILITIES,
    SUPPORTED_INTENTS,
    ToolPermissionLevel,
    WRITE_CONFIRMATION_TTL_MINUTES,
)


def test_agent_intent_values_match_node():
    expected = {
        "DIET_RECORD", "DIET_SUGGESTION", "TRAINING_PLAN_CREATE", "TRAINING_RECORD",
        "TRAINING_PLAN_UPDATE", "BODY_ANALYSIS", "CONFIRM_WRITE", "CANCEL_WRITE", "UNSUPPORTED",
    }
    assert {i.value for i in AgentIntent} == expected


def test_pending_write_type_values_match_node():
    expected = {
        "diet_log", "training_log", "training_plan", "body_metric", "user_profile",
    }
    assert {i.value for i in PendingWriteType} == expected


def test_pending_write_status_values_match_node():
    expected = {
        "waiting_confirm", "confirmed", "cancelled", "failed", "expired",
    }
    assert {i.value for i in PendingWriteStatus} == expected


def test_tool_permission_values_match_node():
    expected = {"read", "write", "sensitive_write"}
    assert {i.value for i in ToolPermissionLevel} == expected


def test_supported_capabilities_match_node():
    assert SUPPORTED_CAPABILITIES == (
        "饮食记录", "饮食建议", "训练计划制定", "训练记录", "训练计划修改", "身体数据分析"
    )
    # 6 个支持的意图 (排除 confirm/cancel/unsupported)
    assert len(SUPPORTED_INTENTS) == 6


def test_write_confirmation_ttl_matches_node():
    assert WRITE_CONFIRMATION_TTL_MINUTES == 30


def test_confirmation_and_cancel_words():
    assert "确认" in CONFIRMATION_WORDS
    assert "对" in CONFIRMATION_WORDS
    assert "取消" in CANCEL_WORDS
    assert "否" in CANCEL_WORDS
