# app/memory/__init__.py
# 记忆系统 — 从 Node runtime/memory/*.js 移植.
#
# 分层:
#   - short_term:    本 session 最近 24 轮对话 (不入长期库)
#   - user_profile:  用户画像 (身高/体重/目标/偏好/伤病史等), 经确认才更新
#   - procedural:    程序性记忆 (Agent 行为规则), 只读
#   - episodic:      情节记忆 (饮食/训练/身体记录), 由 episodicTargets 映射
#   - policy:        记忆读写策略 (什么能写长期/什么只能 session-only/什么禁止长期)
from __future__ import annotations

from app.memory.memory_policy import MEMORY_POLICY, classify_memory_update
from app.memory.procedural_memory import get_procedural_rules
from app.memory.short_term_memory import append_turn
from app.memory.user_profile_memory import normalize_user_profile

__all__ = [
    "MEMORY_POLICY",
    "classify_memory_update",
    "append_turn",
    "normalize_user_profile",
    "get_procedural_rules",
]
