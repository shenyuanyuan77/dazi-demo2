# app/state/state_store.py
# 状态存储 — 1:1 移植 Node state/state_store.js.
#
# 职责: 维护 AgentState (单轮可变状态), 提供 add_error/add_tool_call/add_memory_*
#       等原子操作, 以及 compact_state (导出给 trace/answer 用).
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_initial_state(input_data: dict[str, Any]) -> dict[str, Any]:
    """构造单轮初始状态。"""
    return {
        "userId": input_data.get("userId") or input_data.get("user_id", ""),
        "sessionId": input_data.get("sessionId") or input_data.get("session_id", ""),
        "userProfile": input_data.get("profile") or {},
        "shortTermMemory": list(input_data.get("history") or [])[-20:],
        "episodicMemory": {
            "dietLogs": list(input_data.get("recent_logs") or []),
            "trainingLogs": [],
            "bodyMetrics": [],
        },
        "proceduralMemory": [],
        "pendingWrite": None,
        "toolCallHistory": [],
        "memoryReadHistory": [],
        "memoryWriteHistory": [],
        "errorHistory": [],
        "lastIntent": None,
        "todayTrainingPlan": None,
        "trainingPlans": [],
    }


def add_error(state: dict[str, Any], err: dict[str, Any]) -> None:
    state.setdefault("errorHistory", []).append({
        **err,
        "at": _now_iso(),
    })


def add_tool_call(state: dict[str, Any], call: dict[str, Any]) -> None:
    state.setdefault("toolCallHistory", []).append({
        **call,
        "at": _now_iso(),
    })


def add_memory_read(state: dict[str, Any], entry: dict[str, Any]) -> None:
    state.setdefault("memoryReadHistory", []).append({
        **entry,
        "at": _now_iso(),
    })


def add_memory_write(state: dict[str, Any], entry: dict[str, Any]) -> None:
    state.setdefault("memoryWriteHistory", []).append({
        **entry,
        "at": _now_iso(),
    })


def compact_state(state: dict[str, Any]) -> dict[str, Any]:
    """导出精简状态 (给 trace / answer.agentState 用)."""
    return {
        "userId": state.get("userId"),
        "sessionId": state.get("sessionId"),
        "lastIntent": state.get("lastIntent"),
        "pendingWrite": state.get("pendingWrite"),
        "toolCallCount": len(state.get("toolCallHistory") or []),
        "errorCount": len(state.get("errorHistory") or []),
        "memoryReadCount": len(state.get("memoryReadHistory") or []),
        "memoryWriteCount": len(state.get("memoryWriteHistory") or []),
    }


__all__ = [
    "create_initial_state",
    "add_error",
    "add_tool_call",
    "add_memory_read",
    "add_memory_write",
    "compact_state",
]
