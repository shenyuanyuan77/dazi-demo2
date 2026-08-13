"""工具 schema 定义 — 与原 Node `runtime/tools/tool_schemas.js` 1:1 对齐。

字段值不允许变更 (云函数 handler 按工具名匹配, 错一个名就调不到真实写库逻辑)。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from app.types.agent_types import ToolPermissionLevel


@dataclass(frozen=True)
class ToolSchema:
    """单个工具的 schema。

    `input`/`output` 沿用原 JS 的 "type string" 表示法 (字符串如 "string" / "FoodItem[]"),
    保持迁移期前后端字段语义一致。
    """

    name: str
    permission_level: ToolPermissionLevel
    requires_confirmation: bool
    input: dict[str, str]
    output: dict[str, str]


def _s(
    name: str,
    permission: ToolPermissionLevel,
    *,
    requires_confirmation: bool,
    input_: dict[str, str],
    output: dict[str, str],
) -> ToolSchema:
    return ToolSchema(
        name=name,
        permission_level=permission,
        requires_confirmation=requires_confirmation,
        input=input_,
        output=output,
    )


_READ = ToolPermissionLevel.READ
_WRITE = ToolPermissionLevel.WRITE
_SENSE = ToolPermissionLevel.SENSITIVE_WRITE


TOOL_SCHEMAS: Final[dict[str, ToolSchema]] = {
    # ---------- 用户档案 ----------
    "user.profile.get": _s(
        "user.profile.get", _READ,
        requires_confirmation=False,
        input_={"userId": "string"},
        output={"profile": "UserProfile"},
    ),
    "user.profile.update": _s(
        "user.profile.update", _SENSE,
        requires_confirmation=True,
        input_={"userId": "string", "profilePatch": "object", "source": "chat|card|manual"},
        output={"profile": "UserProfile"},
    ),
    # ---------- 饮食 ----------
    "diet.log.create": _s(
        "diet.log.create", _WRITE,
        requires_confirmation=True,
        input_={"userId": "string", "date": "YYYY-MM-DD", "meal": "string",
                "items": "FoodItem[]", "source": "chat|card|manual"},
        output={"logId": "string", "record": "DietLog"},
    ),
    "diet.log.query": _s(
        "diet.log.query", _READ,
        requires_confirmation=False,
        input_={"userId": "string", "date": "YYYY-MM-DD?", "limit": "number?"},
        output={"list": "DietLog[]"},
    ),
    "diet.analyze": _s(
        "diet.analyze", _READ,
        requires_confirmation=False,
        input_={"userId": "string", "profile": "UserProfile",
                "dietLogs": "DietLog[]", "trainingLogs": "TrainingLog[]"},
        output={"caloriesConsumed": "number", "protein": "number", "advice": "string[]"},
    ),
    # ---------- 训练 ----------
    "training.plan.create": _s(
        "training.plan.create", _WRITE,
        requires_confirmation=True,
        input_={"userId": "string", "date": "YYYY-MM-DD",
                "plan": "TrainingPlan", "source": "chat|card|manual"},
        output={"planId": "string", "plan": "TrainingPlan"},
    ),
    "training.plan.get": _s(
        "training.plan.get", _READ,
        requires_confirmation=False,
        input_={"userId": "string", "date": "YYYY-MM-DD?", "limit": "number?"},
        output={"list": "TrainingPlan[]"},
    ),
    "training.plan.update": _s(
        "training.plan.update", _WRITE,
        requires_confirmation=True,
        input_={"userId": "string", "date": "YYYY-MM-DD",
                "patch": "object", "source": "chat|card|manual"},
        output={"planId": "string", "plan": "TrainingPlan"},
    ),
    "training.log.create": _s(
        "training.log.create", _WRITE,
        requires_confirmation=True,
        input_={"userId": "string", "date": "YYYY-MM-DD",
                "items": "TrainingItem[]", "source": "chat|card|manual"},
        output={"logId": "string", "record": "TrainingLog"},
    ),
    "training.log.query": _s(
        "training.log.query", _READ,
        requires_confirmation=False,
        input_={"userId": "string", "date": "YYYY-MM-DD?", "limit": "number?"},
        output={"list": "TrainingLog[]"},
    ),
    # ---------- 身体 ----------
    "body.metric.create": _s(
        "body.metric.create", _WRITE,
        requires_confirmation=True,
        input_={"userId": "string", "date": "YYYY-MM-DD",
                "metrics": "BodyMetric", "source": "chat|card|manual"},
        output={"metricId": "string", "record": "BodyMetric"},
    ),
    "body.metric.query": _s(
        "body.metric.query", _READ,
        requires_confirmation=False,
        input_={"userId": "string", "limit": "number?"},
        output={"list": "BodyMetric[]"},
    ),
    "body.analyze": _s(
        "body.analyze", _READ,
        requires_confirmation=False,
        input_={"userId": "string", "profile": "UserProfile", "metrics": "BodyMetric[]"},
        output={"trend": "object", "advice": "string[]"},
    ),
    # ---------- 视觉 ----------
    "vision.food.recognize": _s(
        "vision.food.recognize", _READ,
        requires_confirmation=False,
        input_={"userId": "string", "images": "image[]"},
        output={"items": "FoodItem[]", "confidence": "number"},
    ),
    "vision.bodyScale.ocr": _s(
        "vision.bodyScale.ocr", _READ,
        requires_confirmation=False,
        input_={"userId": "string", "images": "image[]"},
        output={"metrics": "BodyMetric", "confidence": "number"},
    ),
    # ---------- 微信 ----------
    "wechat.login": _s(
        "wechat.login", _READ,
        requires_confirmation=False,
        input_={"code": "string"},
        output={"openId": "string", "unionId": "string?"},
    ),
    "wechat.profile.sync": _s(
        "wechat.profile.sync", _SENSE,
        requires_confirmation=True,
        input_={"userId": "string", "wechatProfile": "object"},
        output={"synced": "boolean"},
    ),
}


def get_tool_schema(name: str) -> ToolSchema | None:
    return TOOL_SCHEMAS.get(name)


def list_tool_schemas() -> list[ToolSchema]:
    return list(TOOL_SCHEMAS.values())


def is_write_tool(name: str) -> bool:
    """判断是否为写工具 (含 sensitive_write)。对应原 isWriteTool。"""
    schema = get_tool_schema(name)
    if schema is None:
        return False
    return schema.permission_level in (ToolPermissionLevel.WRITE, ToolPermissionLevel.SENSITIVE_WRITE)


__all__ = [
    "ToolSchema",
    "TOOL_SCHEMAS",
    "get_tool_schema",
    "list_tool_schemas",
    "is_write_tool",
]
