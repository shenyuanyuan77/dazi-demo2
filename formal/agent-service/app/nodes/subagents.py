"""子 agent 构造器 — 从 Node ``runtime/subagents/*.js`` 移植。

每个 subagent 负责：
  - 把槽位 (slots) 转成 ``PendingWrite`` 数据 (type/target/data/summaryForUser)
  - 生成给用户看的草稿回复 (draft reply)

注意：这里只做"构造"，不调用 LLM。LLM 调用在 ``llm_completer.py``。
确认/取消的写入工具执行在云函数侧（agent-service 无 DB 访问）。
"""

from __future__ import annotations

from typing import Any

from app.adapters import PendingWrite
from app.types.agent_types import PendingWriteType, PendingWriteStatus


def _new_id() -> str:
    import uuid
    return "pending-write-" + uuid.uuid4().hex[:12]


def _make_pending(
    pw_type: PendingWriteType,
    target: str,
    data: dict[str, Any],
    summary: str,
) -> PendingWrite:
    return PendingWrite(
        id=_new_id(),
        type=pw_type,
        status=PendingWriteStatus.WAITING_CONFIRM,
        data=data,
        summary_for_user=summary,
    )


# ============================================================
# Diet Agent — diet_record + diet_suggestion
# ============================================================
def build_diet_record_pending(slots: dict[str, Any]) -> PendingWrite:
    items = slots.get("items") or []
    return _make_pending(
        PendingWriteType.DIET_LOG,
        "dietLogs",
        {"date": slots.get("date"), "meal": slots.get("meal", ""), "items": items, "source": "chat"},
        ("饮食记录：" + "、".join(i["name"] for i in items))
        if items else "饮食记录：图片餐食待核对",
    )


def build_diet_record_reply(slots: dict[str, Any]) -> str:
    items = slots.get("items") or []
    if not items and slots.get("hasImages"):
        return "我已调用图片识别工具生成一条待确认饮食记录。请核对食物名称和分量，确认后再写入。"
    if not items:
        return "我还缺少具体食物名称，请补充你吃了什么和大概分量。"
    return f"我识别到你要记录 {'、'.join(i['name'] for i in items)}。是否确认写入饮食记录？"


def build_diet_suggestion_reply(*, remaining_calories: float | None = None, advice: str = "") -> str:
    if remaining_calories is not None and remaining_calories == remaining_calories:
        return f"按已有记录估算，今天剩余约 {round(remaining_calories)} kcal。{advice}"
    return advice or "我会结合你的目标、今日饮食和训练记录给出饮食建议。"


# ============================================================
# Training Agent — training_record + training_plan(create/update)
# ============================================================
def build_training_log_pending(slots: dict[str, Any]) -> PendingWrite:
    items = slots.get("items") or []
    first = items[0] if items else {}
    parts = [first.get("exerciseName") or "训练记录"]
    if first.get("sets"):
        parts.append(f"{first['sets']} 组")
    if first.get("reps"):
        parts.append(f"每组 {first['reps']} 次")
    if first.get("distanceKm"):
        parts.append(f"{first['distanceKm']} 公里")
    if first.get("durationMin"):
        parts.append(f"{first['durationMin']} 分钟")
    return _make_pending(
        PendingWriteType.TRAINING_LOG,
        "trainingLogs",
        {"date": slots.get("date"), "items": items, "source": "chat"},
        "训练记录：" + "，".join(parts) if first.get("exerciseName") else "训练记录",
    )


def build_training_log_reply(slots: dict[str, Any]) -> str:
    items = slots.get("items") or []
    item = items[0] if items else {}
    name = item.get("exerciseName")
    if not name or name == "训练":
        return "我还缺少具体训练动作，请补充动作名称、组数或时长。"
    if item.get("durationMin"):
        return f"我识别到你完成了{name} {item['durationMin']} 分钟，是否确认记录？"
    bits = [name]
    if item.get("sets"):
        bits.append(f"{item['sets']} 组")
    if item.get("reps"):
        bits.append(f"每组 {item['reps']} 次")
    if item.get("weightKg"):
        bits.append(f"重量 {item['weightKg']} kg")
    if item.get("distanceKm"):
        bits.append(f"距离 {item['distanceKm']} 公里")
    return f"我识别到你完成了{'，'.join(bits)}，是否确认记录？"


def build_training_plan_pending(slots: dict[str, Any], operation: str = "create") -> PendingWrite:
    data = {
        "date": slots.get("date"),
        "operation": operation,
        "goal": slots.get("goal", ""),
        "daysPerWeek": slots.get("daysPerWeek"),
        "equipment": slots.get("equipment") or [],
        "planName": slots.get("planName", "训练计划"),
        "exercises": slots.get("exercises") or [],
        "patch": slots.get("patch"),
        "source": "chat",
    }
    summary = "训练计划修改" if operation == "update" else f"{slots.get('goal', '')}训练计划".strip()
    return _make_pending(PendingWriteType.TRAINING_PLAN, "trainingPlans", data, summary)


def build_training_plan_reply(slots: dict[str, Any], operation: str = "create") -> str:
    if operation == "update":
        return "我已整理出训练计划修改草稿，请确认后再写入计划。"
    pieces = []
    if slots.get("goal"):
        pieces.append(slots["goal"])
    if slots.get("daysPerWeek"):
        pieces.append(f"每周 {slots['daysPerWeek']} 天")
    if slots.get("equipment"):
        pieces.append(f"器械：{'、'.join(slots['equipment'])}")
    return f"我已生成{'、'.join(pieces) + ' ' if pieces else ''}训练计划草稿，请确认后再保存。"


# ============================================================
# Body Agent — body_metric + body_analysis
# ============================================================
def has_body_metrics(slots: dict[str, Any]) -> bool:
    return bool(slots.get("metrics"))


def build_body_metric_pending(slots: dict[str, Any]) -> PendingWrite:
    metrics = slots.get("metrics") or {}
    summary = "，".join(f"{k}: {v}" for k, v in metrics.items())
    return _make_pending(
        PendingWriteType.BODY_METRIC,
        "bodyMetrics",
        {
            "date": slots.get("date"),
            "metrics": metrics,
            "source": "image" if slots.get("hasImages") else "chat",
        },
        summary,
    )


def build_body_analysis_reply(slots: dict[str, Any], *, advice: str = "") -> str:
    if has_body_metrics(slots):
        parts = []
        if slots.get("heightCm"):
            parts.append(f"身高 {slots['heightCm']} cm")
        if slots.get("weightKg"):
            parts.append(f"体重 {slots['weightKg']} kg")
        if slots.get("bodyFatRate"):
            parts.append(f"体脂 {slots['bodyFatRate']}%")
        return f"我识别到{'，'.join(parts)}。这些身体数据需要你确认后才会写入记录。"
    return advice or "我会结合最新身体数据和趋势给出分析。"


def build_body_readonly_reply(slots: dict[str, Any]) -> str:
    parts = []
    if slots.get("heightCm"):
        parts.append(f"身高 {slots['heightCm']} cm")
    if slots.get("weightKg"):
        parts.append(f"体重 {slots['weightKg']} kg")
    if slots.get("bodyFatRate"):
        parts.append(f"体脂 {slots['bodyFatRate']}%")
    prefix = f"基于你提供的{'，'.join(parts)}，" if parts else ""
    return f"{prefix}我只做分析，不会写入记录。建议关注 7 日趋势，减脂期优先保证蛋白质、力量训练和稳定睡眠。"


# ============================================================
# Profile Agent
# ============================================================
def build_profile_pending(profile_patch: dict[str, Any]) -> PendingWrite:
    return _make_pending(
        PendingWriteType.USER_PROFILE,
        "userProfile",
        {"profilePatch": profile_patch or {}, "source": "chat"},
        "用户画像更新",
    )


# ============================================================
# Fallback Agent — UNSUPPORTED
# ============================================================
def build_unsupported_reply() -> str:
    from app.adapters.miniprogram_adapter import _unsupported_reply
    return _unsupported_reply()


__all__ = [
    "build_diet_record_pending",
    "build_diet_record_reply",
    "build_diet_suggestion_reply",
    "build_training_log_pending",
    "build_training_log_reply",
    "build_training_plan_pending",
    "build_training_plan_reply",
    "has_body_metrics",
    "build_body_metric_pending",
    "build_body_analysis_reply",
    "build_body_readonly_reply",
    "build_profile_pending",
    "build_unsupported_reply",
]
