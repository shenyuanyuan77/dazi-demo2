"""工具注册表 — 注册真实 handler + 强制执行写入权限校验。

对应原 `runtime/tools/tool_registry.js`，关键点：
- 写工具 (`is_write_tool(name)=True`) 必须传 `confirmed=True` 才执行，
  对应原 harness 的"工具意图校验 + 写入权限校验"。
- 未注册 / schema 未声明确认要求但 handler 收到确认参数不匹配 → 拒绝。
- 工具调用结果统一封装为 `ToolResult` (对应原结构)。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Protocol

from app.tools.tool_schemas import ToolSchema, get_tool_schema, is_write_tool
from app.types.agent_types import PendingWriteStatus


class ToolHandler(Protocol):
    """真实工具 handler 的协议：async, 接收 toolContext + input。"""

    async def __call__(
        self,
        *,
        tool_context: "ToolContext",
        input: dict[str, Any],
        confirmed: bool = False,
    ) -> "ToolResult": ...


@dataclass
class ToolContext:
    """贯穿一次工具调用的上下文 (沿用原 toolContext 结构)。"""

    user_id: str
    session_id: str
    profile: dict[str, Any] = field(default_factory=dict)
    now: str = ""
    images: list[str] = field(default_factory=list)


@dataclass
class ToolResult:
    """工具执行结果 — 对应原 ToolResult 结构。"""

    success: bool
    data: dict[str, Any] = field(default_factory=dict)
    error: str = ""
    pending_write_id: str = ""
    pending_write_status: PendingWriteStatus | None = None
    log_id: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "success": self.success,
            "data": self.data,
            "error": self.error,
            "pendingWriteId": self.pending_write_id,
            "pendingWriteStatus": (
                self.pending_write_status.value if self.pending_write_status else None
            ),
            "logId": self.log_id,
        }


class ToolRegistry:
    """工具注册中心。所有写入必须在调用方明确 `confirmed=True` 时才放行。"""

    def __init__(self) -> None:
        self._handlers: dict[str, ToolHandler] = {}

    def register(self, name: str, handler: ToolHandler) -> None:
        """注册工具 handler。name 必须在 schema 中已声明。"""
        if get_tool_schema(name) is None:
            raise ValueError(f"Tool '{name}' not declared in schema — refusing to register")
        self._handlers[name] = handler

    def has(self, name: str) -> bool:
        return name in self._handlers

    def schema(self, name: str) -> ToolSchema | None:
        return get_tool_schema(name)

    async def execute(
        self,
        name: str,
        *,
        tool_context: ToolContext,
        input: dict[str, Any],
        confirmed: bool = False,
    ) -> ToolResult:
        """执行工具，统一权限校验。"""
        schema = get_tool_schema(name)
        if schema is None:
            return ToolResult(success=False, error=f"unknown_tool:{name}")
        handler = self._handlers.get(name)
        if handler is None:
            return ToolResult(success=False, error=f"handler_not_registered:{name}")

        # 写入门禁 — 这是迁移过程中「不可妥协的底线」
        if is_write_tool(name) and schema.requires_confirmation and not confirmed:
            return ToolResult(
                success=False,
                error="requires_confirmation",
                pending_write_status=PendingWriteStatus.WAITING_CONFIRM,
            )

        try:
            return await handler(
                tool_context=tool_context,
                input=input,
                confirmed=confirmed,
            )
        except Exception as exc:  # noqa: BLE001 — 工具错误必须收敛成 ToolResult
            return ToolResult(success=False, error=f"tool_error:{type(exc).__name__}:{exc}")


def build_registry_from_handlers(
    handlers: dict[str, ToolHandler] | None,
) -> ToolRegistry:
    """便捷构造：接收 {tool_name: handler} 字典，返回注入完成的 registry。"""
    registry = ToolRegistry()
    for name, handler in (handlers or {}).items():
        registry.register(name, handler)
    return registry


__all__ = [
    "ToolContext",
    "ToolResult",
    "ToolHandler",
    "ToolRegistry",
    "build_registry_from_handlers",
]
