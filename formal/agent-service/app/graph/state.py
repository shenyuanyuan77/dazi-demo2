# LangGraph 状态定义 - 全部节点共享.

from __future__ import annotations

from typing import Any, TypedDict

from app.adapters import PendingWrite
from app.types.agent_types import AgentIntent, ResponseMode


class TurnInput(TypedDict, total=False):
    """入口请求体 (大致对应原 harness.runTurn 的 input)。"""

    user_id: str
    session_id: str
    message: str
    images: list[str]            # data URL 或 https URL
    image_data: list[str]        # data URL 兼容字段
    profile: dict[str, Any]
    history: list[dict[str, Any]]
    recent_logs: list[dict[str, Any]]
    memory: list[dict[str, Any]]
    client_message_id: str
    recognition_id: str
    intent_hint: dict[str, Any]  # 前端可给一个粗略意图提示 (弱信号)
    previous_state: dict[str, Any]
    now: str


class ToolCallRecord(TypedDict):
    id: str
    name: str
    success: bool
    error: str
    data: dict[str, Any]


class TraceEntry(TypedDict):
    stage: str
    data: dict[str, Any]


class AgentGraphState(TypedDict, total=False):
    """LangGraph 各节点共享的可变状态。

    `input`: 进入图的原始输入.
    `intent`: 意图识别结果.
    `slots`: 槽位.
    `pending_write`: 待确认写入.
    `tool_calls`: 本轮已执行的工具调用.
    `trace`: 编排轨迹.
    `model_reply`: 大模型的原文内容 (call_model 模式才有).
    `response_mode`: SHORT_CIRCUIT / CALL_MODEL.
    `is_new_response`: 是否需要最终回答生成 (LLM 节点).
    `confirmed_by_user`: 本轮用户是否已确认写入.
    `validation_errors`: 出口校验发现的问题.
    `answer`: 最终 Answer (END 节点之前填好).
    """

    # 入口
    input: TurnInput

    # 路由层
    intent: AgentIntent
    intent_confidence: float
    is_new_response: bool
    slots: dict[str, Any]                  # 槽位 (M2 新增)

    # 上下文 / 检索层
    context_used: dict[str, Any]
    retrieved_docs: list[dict[str, Any]]

    # 写入安全
    previous_pending: PendingWrite | None  # 从 previous_state 恢复的上一轮 pendingWrite (M2)
    pending_write: PendingWrite | None
    confirmed_by_user: bool

    # 工具执行
    tool_calls: list[ToolCallRecord]

    # LLM
    model_reply: str
    response_mode: ResponseMode

    # 出口
    validation_errors: list[str]
    trace: list[TraceEntry]
    answer: Any  # Answer
