# app/memory/procedural_memory.py
# 程序性记忆 — Agent 行为规则 (只读), 1:1 移植 Node proceduralMemory.js.
from __future__ import annotations

_RULES = (
    "只支持饮食记录、饮食建议、训练计划制定、训练记录、训练计划修改、身体数据分析。",
    "所有饮食、训练、计划、身体数据和用户画像写入必须先生成 pendingWrite。",
    "用户确认后才能调用写工具。",
    "确认只作用于当前 session 最新且未过期的 pendingWrite。",
    "图片识别必须调用 vision 工具，不得凭空猜测。",
    "工具失败时不能回复已完成。",
    "不支持问题必须进入 UNSUPPORTED 流程。",
)


def get_procedural_rules() -> list[str]:
    return list(_RULES)


__all__ = ["get_procedural_rules"]
