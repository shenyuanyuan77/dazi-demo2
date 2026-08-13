# app/memory/short_term_memory.py
# 短期记忆 — 本 session 最近对话, 1:1 移植 Node shortTermMemory.js.
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def append_turn(
    short_term_memory: list[dict[str, Any]] | None,
    user_message: str,
    assistant_reply: str,
) -> list[dict[str, Any]]:
    """追加一轮对话到短期记忆, 保留最近 24 条。"""
    nxt = (short_term_memory or [])[-20:]
    if user_message:
        nxt.append({
            "role": "user",
            "content": str(user_message)[:1200],
            "at": _now_iso(),
        })
    if assistant_reply:
        nxt.append({
            "role": "assistant",
            "content": str(assistant_reply)[:1200],
            "at": _now_iso(),
        })
    return nxt[-24:]


__all__ = ["append_turn"]
