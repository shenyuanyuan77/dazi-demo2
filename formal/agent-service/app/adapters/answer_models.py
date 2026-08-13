# answer 协议 pydantic 模型 — 与小程序前端 AI_CHAT 渲染严格对齐
#
# 字段名 1:1 对应原 JS adapter 输出 (camelCase), 因此前端调用 `payload.proposals` /
# `answer.payload.agentState.pendingWrite` 等代码无需改动。

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

AnswerType = Literal["diet", "training", "general"]
SafetyLevel = Literal["none", "caution", "urgent"]
ProposalStatus = Literal["pending", "confirmed", "cancelled", "failed", "expired"]
ProposalType = Literal["dietLog", "workoutPlan", "profilePatch", "bodyMetric"]


class AnswerSafety(BaseModel):
    # 对应 answer.safety
    model_config = ConfigDict(extra="allow")

    level: SafetyLevel = "none"
    message: str = ""


class Proposal(BaseModel):
    # 待确认提案卡片 - 对应前端 _decorateProposal 渲染入口
    model_config = ConfigDict(extra="allow")

    id: str
    type: ProposalType
    status: ProposalStatus
    summary: str
    payload: dict[str, Any]


class AgentState(BaseModel):
    # 对应 answer.payload.agentState
    model_config = ConfigDict(extra="allow")

    current_task: dict[str, Any] = Field(default_factory=dict, alias="currentTask")
    pending_write: dict[str, Any] | None = Field(default=None, alias="pendingWrite")
    validation_result: dict[str, Any] | None = Field(default=None, alias="validationResult")


class AnswerPayload(BaseModel):
    # 对应 answer.payload
    model_config = ConfigDict(extra="allow")

    proposals: list[Proposal] = Field(default_factory=list)
    agent_harness: dict[str, Any] | None = Field(default=None, alias="agentHarness")
    agent_state: AgentState | None = Field(default=None, alias="agentState")
    memory: dict[str, Any] | None = None  # 大模型回答可能携带 memory 段(向后兼容)


class Answer(BaseModel):
    # 从 Python agent 返回给云函数 -> 小程序前端的完整 answer.
    # 设计: 内部 Python 代码用 snake_case (request_id) 构造, 输出 JSON 用 camelCase (requestId).
    # 因此 populate_by_name=True 允许两种构造方式, 序列化一律 by_alias.
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    type: AnswerType = "general"
    title: str = "AI 教练"
    content: str
    payload: AnswerPayload = Field(default_factory=AnswerPayload)
    memory: dict[str, Any] | None = None
    safety: AnswerSafety = Field(default_factory=AnswerSafety)
    model: str = ""
    request_id: str = Field(default="", alias="requestId")

    def to_miniprogram_json(self) -> dict[str, Any]:
        # 输出给云函数 forward 的 JSON - camelCase, payload 永远是对象
        data = self.model_dump(by_alias=True, exclude_none=False)
        data["payload"] = data.get("payload") or {}
        return data
