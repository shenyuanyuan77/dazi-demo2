# app/memory/user_profile_memory.py
# 用户画像记忆 — 1:1 移植 Node userProfileMemory.js.
from __future__ import annotations

from typing import Any


def _sanitize(value: Any) -> Any:
    """递归清理 None/空, 防 prototype 污染式注入。"""
    if isinstance(value, dict):
        return {k: _sanitize(v) for k, v in value.items() if v is not None}
    if isinstance(value, list):
        return [_sanitize(v) for v in value if v is not None]
    return value


def normalize_user_profile(profile: dict[str, Any] | None) -> dict[str, Any]:
    """归一化用户画像: 清理空值 + 体重保留 1 位小数 + 身高取整。"""
    clean = _sanitize(profile or {})
    if "weightKg" in clean and clean["weightKg"] is not None:
        try:
            clean["weightKg"] = round(float(clean["weightKg"]) * 10) / 10
        except (TypeError, ValueError):
            pass
    if "heightCm" in clean and clean["heightCm"] is not None:
        try:
            clean["heightCm"] = round(float(clean["heightCm"]))
        except (TypeError, ValueError):
            pass
    return clean


__all__ = ["normalize_user_profile"]
