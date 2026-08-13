"""Prompt 拼装 — 从 Node ``runtime/prompt/prompt_builder.js`` 移植。

职责：把上下文 (profile/history/memory/official constraints/tool list) 拼成 system prompt，
供 ``llm_completer`` 调用 MiMo 时使用。

输出协议严格对齐前端：模型必须输出 JSON object (禁止 Markdown 包裹)。
"""

from __future__ import annotations

import json
from typing import Any

from app.data.official import build_official_constraints_prompt
from app.tools.tool_schemas import list_tool_schemas
from app.types.agent_types import SUPPORTED_CAPABILITIES


def build_system_prompt(context: dict[str, Any] | None = None) -> str:
    """构造 system prompt。``context`` 形如 ``{'data': {...}, ...}``。"""
    ctx = (context or {}).get("data") or {}
    caps = "\n".join(f"{i}. {c}" for i, c in enumerate(SUPPORTED_CAPABILITIES, 1))
    tools = json.dumps(
        [
            {
                "name": t.name,
                "permissionLevel": t.permission_level.value,
                "requiresConfirmation": t.requires_confirmation,
            }
            for t in list_tool_schemas()
        ],
        ensure_ascii=False,
        indent=2,
    )
    return "\n".join([
        "你是健身饮食小程序中的健康管理 agent。",
        "",
        "你只支持：",
        caps,
        "",
        "涉及写入用户数据时，必须先生成待确认写入项，并向用户确认。",
        "用户确认后，才可以调用写入工具。",
        "不能编造用户身体数据、饮食记录、训练记录。",
        "缺少必要信息时，应追问。",
        "不支持的问题，应返回支持范围和建议问法。",
        "",
        build_official_constraints_prompt(),
        "",
        "当前上下文：",
        json.dumps(ctx, ensure_ascii=False, indent=2),
        "",
        "可用工具：",
        tools,
        "",
        "输出必须是结构化 AgentTurnResult。",
    ])


# 给 LLM intent router 用的精简分类 prompt (走 fast 模型)
INTENT_ROUTER_SYSTEM = "\n".join([
    "你是一个意图分类器。根据用户消息判断意图，只输出一个 JSON 对象，不要输出其他内容。",
    "可选意图：",
    "- DIET_RECORD        用户记录已吃过的食物/一餐",
    "- DIET_SUGGESTION    用户询问饮食建议/能吃多少/怎么吃",
    "- TRAINING_PLAN_CREATE 用户要求制定/安排训练计划",
    "- TRAINING_PLAN_UPDATE 用户要求修改/调整现有训练计划",
    "- TRAINING_RECORD    用户记录今天完成的训练动作",
    "- BODY_ANALYSIS      用户报告或询问体重/体脂/身高等身体数据",
    "- UNSUPPORTED        不在健身饮食范围内的请求（闲聊/写作/财经/天气等）",
    "",
    '输出格式：{"intent":"<意图>","confidence":0.0-1.0,"reason":"简短原因"}',
    "",
    "规则：",
    "- 已吃过的食物 -> DIET_RECORD；未来的饮食计划 -> DIET_SUGGESTION",
    '- "改成/换成" -> TRAINING_PLAN_UPDATE；"安排/制定" -> TRAINING_PLAN_CREATE',
    "- 涉及体重体脂身高 -> BODY_ANALYSIS",
    "- 跟健身饮食完全无关 -> UNSUPPORTED",
])


def build_intent_router_user_prompt(message: str, *, has_images: bool) -> str:
    flags = []
    if has_images:
        flags.append("用户附带了图片")
    prefix = f"[{'；'.join(flags)}] " if flags else ""
    return f"{prefix}用户消息：{message or '(空)'}"


__all__ = [
    "build_system_prompt",
    "INTENT_ROUTER_SYSTEM",
    "build_intent_router_user_prompt",
]
