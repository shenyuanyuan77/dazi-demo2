"""Agent 类型定义 — 与原 Node harness 共享/向前兼容。

字符串值必须 1:1 对齐原 `cloudfunctions/mcloud/fitness-agent-harness/shared/types/agent_types.js`，
因为：
- 写入 `AI_LOG / AI_MESSAGE` 时 type 字段会被前端解析
- pendingWrite 的 status 串值在云函数/小程序两端解析

迁移时严禁修改这些字面量，只能新增。
"""

from __future__ import annotations

from enum import Enum


class StrEnum(str, Enum):
    """字符串枚举基类。`str` 子类保证 JSON 序列化为原始字符串值。

    Python 3.11 起标准库有 `enum.StrEnum`，这里手写一份以兼容 3.10。
    """

    def __str__(self) -> str:  # pragma: no cover - 直接序列化用 .value
        return self.value


# ============================================================
# 意图 (AgentIntent) — 对应原 AgentIntent
# ============================================================
class AgentIntent(StrEnum):
    DIET_RECORD = "DIET_RECORD"
    DIET_SUGGESTION = "DIET_SUGGESTION"
    TRAINING_PLAN_CREATE = "TRAINING_PLAN_CREATE"
    TRAINING_RECORD = "TRAINING_RECORD"
    TRAINING_PLAN_UPDATE = "TRAINING_PLAN_UPDATE"
    BODY_ANALYSIS = "BODY_ANALYSIS"
    CONFIRM_WRITE = "CONFIRM_WRITE"
    CANCEL_WRITE = "CANCEL_WRITE"
    UNSUPPORTED = "UNSUPPORTED"


# 用户实际能体验到的能力 (用于 prompt 自我约束 / 越界拒答)
SUPPORTED_INTENTS: frozenset[AgentIntent] = frozenset(
    {
        AgentIntent.DIET_RECORD,
        AgentIntent.DIET_SUGGESTION,
        AgentIntent.TRAINING_PLAN_CREATE,
        AgentIntent.TRAINING_RECORD,
        AgentIntent.TRAINING_PLAN_UPDATE,
        AgentIntent.BODY_ANALYSIS,
    }
)

# 对应原 SUPPORTED_CAPABILITIES (中文, 给 prompt 看的)
SUPPORTED_CAPABILITIES: tuple[str, ...] = (
    "饮食记录",
    "饮食建议",
    "训练计划制定",
    "训练记录",
    "训练计划修改",
    "身体数据分析",
)


# ============================================================
# 写入待确认 (pendingWrite) — 对应 PendingWriteType / PendingWriteStatus
# ============================================================
class PendingWriteType(StrEnum):
    DIET_LOG = "diet_log"
    TRAINING_LOG = "training_log"
    TRAINING_PLAN = "training_plan"
    BODY_METRIC = "body_metric"
    USER_PROFILE = "user_profile"


class PendingWriteStatus(StrEnum):
    WAITING_CONFIRM = "waiting_confirm"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    FAILED = "failed"
    EXPIRED = "expired"


# 对应原 WRITE_CONFIRMATION_TTL_MINUTES = 30
WRITE_CONFIRMATION_TTL_MINUTES: int = 30


# ============================================================
# 工具权限分级 — ToolPermissionLevel
# ============================================================
class ToolPermissionLevel(StrEnum):
    READ = "read"
    WRITE = "write"
    SENSITIVE_WRITE = "sensitive_write"


# ============================================================
# 响应模式 — RESPONSE_MODE
# ============================================================
class ResponseMode(StrEnum):
    SHORT_CIRCUIT = "short_circuit"  # harness 直接出答案, 不调模型
    CALL_MODEL = "call_model"  # 需要调用 LLM


# ============================================================
# 意图分类 (决定走 READ/short_circuit/call_model 哪条路径)
# 对应原 READ_INTENTS / MODEL_ASSISTED_INTENTS
# ============================================================
READ_INTENTS: frozenset[AgentIntent] = frozenset(
    {AgentIntent.DIET_SUGGESTION, AgentIntent.BODY_ANALYSIS}
)

# 必须借助 LLM 才能产出高质量回答的意图
# (其它意图走规则 short_circuit: CONFIRM/CANCEL/UNSUPPORTED + 一些纯记录)
MODEL_ASSISTED_INTENTS: frozenset[AgentIntent] = frozenset(
    {
        AgentIntent.DIET_SUGGESTION,
        AgentIntent.TRAINING_PLAN_CREATE,
        AgentIntent.TRAINING_PLAN_UPDATE,
        AgentIntent.BODY_ANALYSIS,
    }
)


# ============================================================
# 确认词 / 取消词 — 对应原 CONFIRMATION_WORDS / CANCEL_WORDS
# 保留作为 LLM router 失效时的硬兜底, 文本精确匹配优先级最高.
# ============================================================
CONFIRMATION_WORDS: tuple[str, ...] = (
    "确认",
    "可以",
    "没问题",
    "保存",
    "写入",
    "记上",
    "就这样",
    "对",
)

CANCEL_WORDS: tuple[str, ...] = (
    "取消",
    "不用",
    "不要",
    "算了",
    "不保存",
    "先别",
    "否",
)


__all__ = [
    "StrEnum",
    "AgentIntent",
    "SUPPORTED_INTENTS",
    "SUPPORTED_CAPABILITIES",
    "PendingWriteType",
    "PendingWriteStatus",
    "WRITE_CONFIRMATION_TTL_MINUTES",
    "ToolPermissionLevel",
    "ResponseMode",
    "READ_INTENTS",
    "MODEL_ASSISTED_INTENTS",
    "CONFIRMATION_WORDS",
    "CANCEL_WORDS",
]
