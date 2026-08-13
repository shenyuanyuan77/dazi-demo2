"""验证工具 schema 与原 Node tool_schemas.js 1:1.

工具名是云函数 handler 匹配的硬契约 (错一个就调不到真实写入),
迁移过程中任何改名都应被本测试拦下.
"""

from app.tools import (
    TOOL_SCHEMAS,
    ToolRegistry,
    get_tool_schema,
    is_write_tool,
    list_tool_schemas,
)
from app.types.agent_types import ToolPermissionLevel
import pytest


EXPECTED_TOOL_NAMES = {
    "user.profile.get",
    "user.profile.update",
    "diet.log.create",
    "diet.log.query",
    "diet.analyze",
    "training.plan.create",
    "training.plan.get",
    "training.plan.update",
    "training.log.create",
    "training.log.query",
    "body.metric.create",
    "body.metric.query",
    "body.analyze",
    "vision.food.recognize",
    "vision.bodyScale.ocr",
    "wechat.login",
    "wechat.profile.sync",
}


def test_all_17_tools_present():
    assert set(TOOL_SCHEMAS.keys()) == EXPECTED_TOOL_NAMES
    assert len(EXPECTED_TOOL_NAMES) == 17


@pytest.mark.parametrize(
    "name,permission,requires_confirm",
    [
        ("diet.log.create", ToolPermissionLevel.WRITE, True),
        ("diet.log.query", ToolPermissionLevel.READ, False),
        ("training.plan.create", ToolPermissionLevel.WRITE, True),
        ("training.log.create", ToolPermissionLevel.WRITE, True),
        ("body.metric.create", ToolPermissionLevel.WRITE, True),
        ("user.profile.update", ToolPermissionLevel.SENSITIVE_WRITE, True),
        ("user.profile.get", ToolPermissionLevel.READ, False),
        ("wechat.profile.sync", ToolPermissionLevel.SENSITIVE_WRITE, True),
    ],
)
def test_permission_and_confirm_match(name, permission, requires_confirm):
    schema = get_tool_schema(name)
    assert schema is not None
    assert schema.permission_level == permission
    assert schema.requires_confirmation is requires_confirm


def test_is_write_tool():
    assert is_write_tool("diet.log.create")
    assert is_write_tool("user.profile.update")  # sensitive_write 也是写
    assert not is_write_tool("diet.log.query")
    assert not is_write_tool("nonexistent.tool")  # 未声明 -> False, 不抛


# ============== 写入门禁测试 — 迁移不可妥协的底线 ==============

@pytest.mark.asyncio
async def test_write_tool_requires_confirmation():
    # 即使 handler 注册了, 未传 confirmed=True 也必须被拒绝
    async def handler(**kwargs):
        # 不应该被调用到
        from app.tools import ToolResult
        return ToolResult(success=True)

    registry = ToolRegistry()
    registry.register("diet.log.create", handler)

    result = await registry.execute(
        "diet.log.create",
        tool_context=None,  # type: ignore[arg-type]
        input={"userId": "u1", "items": []},
        confirmed=False,
    )
    assert not result.success
    assert result.error == "requires_confirmation"


@pytest.mark.asyncio
async def test_unknown_tool_rejected():
    registry = ToolRegistry()
    result = await registry.execute(
        "tool.does.not.exist",
        tool_context=None,  # type: ignore[arg-type]
        input={},
    )
    assert not result.success
    assert result.error.startswith("unknown_tool:")


@pytest.mark.asyncio
async def test_unregistered_handler_rejected():
    # schema 有, 但没注册 handler
    registry = ToolRegistry()
    result = await registry.execute(
        "diet.log.query",
        tool_context=None,  # type: ignore[arg-type]
        input={},
    )
    assert not result.success
    assert result.error.startswith("handler_not_registered:")


def test_register_unknown_tool_raises():
    registry = ToolRegistry()
    with pytest.raises(ValueError):
        registry.register("not.in.schema", lambda **k: None)
