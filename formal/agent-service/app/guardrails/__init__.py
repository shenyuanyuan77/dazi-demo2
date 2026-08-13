# app/guardrails/__init__.py
# 安全门禁 — 从 Node runtime/guardrails/guardrails.js 移植.
#
# 四类门禁:
#   - input_guardrail:        入口消息长度/空值检查
#   - validate_tool_intent:   意图与工具匹配 (饮食意图不能调训练工具)
#   - validate_write_tool_call: 写工具必须 confirmed
#   - scope_guardrail:        UNSUPPORTED 回复不能越界展开
from __future__ import annotations

import re

from app.tools.tool_schemas import get_tool_schema
from app.types.agent_types import (
    AgentIntent,
    SUPPORTED_CAPABILITIES,
    ToolPermissionLevel,
)


def unsupported_reply() -> str:
    caps = "、".join(SUPPORTED_CAPABILITIES)
    return (
        f"这个问题不在当前健康管理 agent 的支持范围内。我现在只支持：{caps}。"
        "你可以问：今天吃了什么怎么记录、今天还能吃多少热量、帮我安排训练、帮我分析体重或体脂。"
    )


def input_guardrail(message: str) -> dict[str, object]:
    """入口门禁: 空值/过长拒绝。"""
    text = str(message or "").strip()
    if not text:
        return {"allowed": False, "reason": "EMPTY_INPUT", "reply": "请先输入要记录或咨询的内容。"}
    if len(text) > 1200:
        return {"allowed": False, "reason": "INPUT_TOO_LONG", "reply": "这条内容太长了，请拆成更短的健康记录或问题。"}
    return {"allowed": True}


def validate_tool_intent(intent: AgentIntent, tool_name: str) -> dict[str, object]:
    """意图与工具匹配校验。饮食意图不能调训练工具, 反之亦然。"""
    schema = get_tool_schema(tool_name)
    if schema is None:
        return {"allowed": False, "reason": "UNKNOWN_TOOL"}
    if intent == AgentIntent.TRAINING_RECORD and tool_name.startswith("diet."):
        return {"allowed": False, "reason": "TRAINING_CANNOT_CALL_DIET_TOOL"}
    if intent == AgentIntent.DIET_RECORD and tool_name.startswith("training."):
        return {"allowed": False, "reason": "DIET_CANNOT_CALL_TRAINING_TOOL"}
    return {"allowed": True}


def validate_write_tool_call(tool_call: dict, confirmed_by_user: bool) -> dict[str, object]:
    """写工具必须经过用户确认。"""
    name = tool_call.get("name") if isinstance(tool_call, dict) else None
    schema = get_tool_schema(name) if name else None
    if schema is None:
        return {"allowed": False, "reason": "UNKNOWN_TOOL"}
    is_write = schema.permission_level in (ToolPermissionLevel.WRITE, ToolPermissionLevel.SENSITIVE_WRITE)
    if is_write and not confirmed_by_user:
        return {"allowed": False, "reason": "WRITE_REQUIRES_CONFIRMATION"}
    return {"allowed": True}


_SCOPE_EXPANSION_RE = re.compile(r"(论文|代码|旅游|股市).{0,80}(首先|可以|建议你|步骤)")


def scope_guardrail(intent: AgentIntent, reply: str) -> dict[str, object]:
    """UNSUPPORTED 的回复不能越界展开 (eg. 虽说不支持但还是给了详细步骤)."""
    if intent != AgentIntent.UNSUPPORTED:
        return {"allowed": True}
    if _SCOPE_EXPANSION_RE.search(str(reply or "")):
        return {"allowed": False, "reason": "UNSUPPORTED_ANSWER_EXPANDED"}
    return {"allowed": True}


__all__ = [
    "unsupported_reply",
    "input_guardrail",
    "validate_tool_intent",
    "validate_write_tool_call",
    "scope_guardrail",
]
