"""槽位解析器 — 从 Node ``runtime/parser/slot_parser.js`` 移植。

职责：给定意图 + 用户消息，抽取结构化槽位（餐次、食物项、训练动作、身体数据、日期等），
供 subagent 构造 ``PendingWrite``。

迁移铁律：抽取规则与 Node 端 1:1 对齐，不得漂移（否则双轨期意图一致但数据形状分叉）。
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Any

from app.types.agent_types import AgentIntent


# ============================================================
# 中文数字解析 — 对应 Node parseChineseNumber
# ============================================================
_CN_NUM = {
    "零": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4,
    "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10,
}


def parse_chinese_number(value: str) -> float:
    text = str(value or "").strip()
    if re.fullmatch(r"\d+(?:\.\d+)?", text):
        return float(text)
    if text == "十":
        return 10
    if re.fullmatch(r"十[一二三四五六七八九]", text):
        return 10 + _CN_NUM[text[1]]
    if re.fullmatch(r"[一二两三四五六七八九]十", text):
        return _CN_NUM[text[0]] * 10
    if re.fullmatch(r"[一二两三四五六七八九]十[一二三四五六七八九]", text):
        return _CN_NUM[text[0]] * 10 + _CN_NUM[text[2]]
    if text in _CN_NUM:
        return float(_CN_NUM[text])
    return float("nan")


_NUM_PAT = r"(\d+(?:\.\d+)?|[一二两三四五六七八九十]{1,3})"


def first_number(text: str, pattern: str) -> float | None:
    m = re.search(pattern, text or "")
    if not m:
        return None
    v = parse_chinese_number(m.group(1))
    return v if v == v else None  # NaN check


# ============================================================
# 日期 / 餐次 — 对应 Node extractDate / inferMeal
# ============================================================
def extract_date(text: str, now: date | None = None) -> str:
    n = now or date.today()
    if "明天" in text:
        return (n + timedelta(days=1)).isoformat()
    if "后天" in text:
        return (n + timedelta(days=2)).isoformat()
    return n.isoformat()


def infer_meal(text: str) -> str:
    if re.search(r"早餐|早饭|早上", text):
        return "breakfast"
    if re.search(r"午餐|午饭|中午", text):
        return "lunch"
    if re.search(r"晚餐|晚饭|晚上", text):
        return "dinner"
    if re.search(r"加餐|夜宵|刚才|奶茶|喝了", text):
        return "snack"
    return ""


# ============================================================
# 饮食项提取 — 对应 Node extractDietItems
# ============================================================
_KNOWN_FOODS = [
    "牛肉面", "奶茶", "米饭", "鸡胸肉", "鸡胸", "青菜", "鸡蛋", "酸奶", "苹果", "香蕉",
]


def _unit_for(name: str) -> str:
    if name == "奶茶":
        return "杯"
    if "面" in name:
        return "碗"
    return "份"


def extract_diet_items(text: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for name in _KNOWN_FOODS:
        if name in text:
            items.append({
                "name": "鸡胸肉" if name == "鸡胸" else name,
                "amount": 1,
                "unit": _unit_for(name),
                "calories": 0,
                "protein": 0,
                "carbs": 0,
                "fat": 0,
                "confidence": 0.65,
            })
    if items:
        return items
    # 未命中已知食物 -> 去掉引导词后按分隔符切
    cleaned = re.sub(
        r"^(早餐|午餐|晚餐|早饭|午饭|晚饭)?(吃了|有|喝了|刚才|帮我|记录|记一下|一下|，|,|\s)+",
        "", text or "",
    )
    cleaned = re.sub(r"(帮我)?(记录|记一下|一下)$", "", cleaned).strip()
    if not cleaned:
        return []
    return [
        {
            "name": seg.strip(),
            "amount": 1,
            "unit": "份",
            "calories": 0,
            "protein": 0,
            "carbs": 0,
            "fat": 0,
            "confidence": 0.45,
        }
        for seg in re.split(r"[、，,和]", cleaned)
        if seg.strip()
    ][:6]


# ============================================================
# 训练记录提取 — 对应 Node parseTrainingRecord
# ============================================================
_EXERCISE_NAMES = [
    "卧推", "深蹲", "硬拉", "跑步", "跳绳", "游泳", "骑行", "椭圆机",
    "划船", "推举", "俯卧撑", "引体向上", "卷腹", "平板支撑", "有氧",
    "箭步蹲", "臀桥",
]


def extract_exercise_name(text: str) -> str:
    for name in _EXERCISE_NAMES:
        if name in text:
            return "跑步" if name == "跑步" else name
    # 兼容 "跑了"
    if "跑了" in text:
        return "跑步"
    return "训练"


def parse_training_record(text: str) -> dict[str, Any]:
    item: dict[str, Any] = {"exerciseName": extract_exercise_name(text)}
    sets = first_number(text, rf"{_NUM_PAT}\s*组")
    reps = (
        first_number(text, rf"每组\s*{_NUM_PAT}\s*(次|个)")
        or first_number(text, rf"{_NUM_PAT}\s*(次|个)")
    )
    duration = first_number(text, rf"{_NUM_PAT}\s*分钟")
    distance = first_number(text, rf"{_NUM_PAT}\s*(公里|千米|km)")
    weight = first_number(text, rf"{_NUM_PAT}\s*(公斤|千克|kg)")
    if sets is not None:
        item["sets"] = sets
    if reps is not None:
        item["reps"] = reps
    if duration is not None:
        item["durationMin"] = duration
    if distance is not None:
        item["distanceKm"] = distance
    if weight is not None:
        item["weightKg"] = weight
    return {"items": [item]}


# ============================================================
# 训练计划提取 — 对应 Node parseTrainingPlan + buildDefaultExercises
# ============================================================
def _build_default_exercises(goal: str, equipment: list[str]) -> list[dict[str, Any]]:
    if "哑铃" in equipment:
        return [
            {"name": "哑铃深蹲", "sets": [{"reps": "12", "restSeconds": 60}]},
            {"name": "哑铃划船", "sets": [{"reps": "12", "restSeconds": 60}]},
            {"name": "哑铃推举", "sets": [{"reps": "10", "restSeconds": 75}]},
            {"name": "平板支撑", "sets": [{"reps": "45秒", "restSeconds": 45}]},
        ]
    if goal == "增肌":
        return [
            {"name": "深蹲", "sets": [{"reps": "8-10", "restSeconds": 90}]},
            {"name": "卧推", "sets": [{"reps": "8-10", "restSeconds": 90}]},
            {"name": "划船", "sets": [{"reps": "10-12", "restSeconds": 75}]},
        ]
    return [
        {"name": "快走或慢跑", "sets": [{"reps": "30分钟", "restSeconds": 0}]},
        {"name": "深蹲", "sets": [{"reps": "12", "restSeconds": 60}]},
        {"name": "俯卧撑", "sets": [{"reps": "10", "restSeconds": 60}]},
        {"name": "平板支撑", "sets": [{"reps": "45秒", "restSeconds": 45}]},
    ]


def parse_training_plan(text: str) -> dict[str, Any]:
    goal = "增肌" if "增肌" in text else ("减脂" if "减脂" in text else "")
    days = first_number(text, rf"每周\s*(?:练|训练)?\s*{_NUM_PAT}\s*天")
    equipment: list[str] = []
    if "哑铃" in text:
        equipment.append("哑铃")
    if "瑜伽垫" in text:
        equipment.append("瑜伽垫")
    if "杠铃" in text:
        equipment.append("杠铃")
    if re.search(r"徒手|居家", text):
        equipment.append("徒手")
    return {
        "goal": goal,
        "daysPerWeek": days,
        "equipment": equipment,
        "planName": f"{goal}训练计划" if goal else "训练计划",
        "exercises": _build_default_exercises(goal, equipment),
    }


def parse_plan_update(text: str) -> dict[str, Any]:
    if "明天" in text:
        target_day = "tomorrow"
    elif "今天" in text:
        target_day = "today"
    else:
        m = re.search(r"周[一二三四五六日天]", text)
        target_day = m.group(0) if m else ""
    operation = "reduce_volume" if "减半" in text else "replace"
    m = re.search(r"改成([^，,。]+)", text) or re.search(r"换成([^，,。]+)", text)
    replacement = (m.group(1) if m else "").strip()
    return {
        "targetDay": target_day,
        "operation": operation,
        "replacement": replacement,
        "patch": {
            "targetDay": target_day,
            "operation": operation,
            "replacement": replacement,
            "rawText": text,
        },
        "exercises": (
            [{"name": replacement, "sets": [{"reps": "按计划执行", "restSeconds": 60}]}]
            if replacement else []
        ),
    }


# ============================================================
# 身体数据提取 — 对应 Node parseBodyMetrics
# ============================================================
def parse_body_metrics(text: str) -> dict[str, Any]:
    height = first_number(text, r"(?:我\s*)?(\d{2,3})(?:\s*cm|厘米|公分)?(?:[，,\s]|$)")
    jin = first_number(text, rf"{_NUM_PAT}\s*斤")
    kg = first_number(text, rf"{_NUM_PAT}\s*(?:公斤|千克|kg)")
    body_fat = first_number(text, rf"体脂\s*{_NUM_PAT}\s*%?")
    metrics: dict[str, Any] = {}
    slots: dict[str, Any] = {}
    if height is not None and 80 <= height <= 230:
        metrics["heightCm"] = height
        slots["heightCm"] = height
    if jin is not None:
        slots["weightJin"] = jin
        slots["weightKg"] = round(jin * 0.5, 1)
        metrics["weightKg"] = slots["weightKg"]
    elif kg is not None:
        slots["weightKg"] = kg
        metrics["weightKg"] = kg
    if body_fat is not None:
        slots["bodyFatRate"] = body_fat
        metrics["bodyFatRate"] = body_fat
    return {"metrics": metrics, "slots": slots}


# ============================================================
# writeDenied 判定
# ============================================================
_WRITE_DENIED_RE = re.compile(
    r"(不用|不要|无需|先别).{0,8}(记录|保存|写入|记上)"
    r"|只.{0,8}(分析|看看|建议|评估)"
    r"|不.{0,4}(保存|写入|记录)"
)


def is_write_denied(text: str) -> bool:
    return bool(_WRITE_DENIED_RE.search(text or ""))


# ============================================================
# 入口 — 对应 Node parseSlots
# ============================================================
def parse_slots(
    intent: AgentIntent, message: str, *, has_images: bool = False, now: date | None = None
) -> dict[str, Any]:
    text = (message or "").strip()
    n = now or date.today()
    d = extract_date(text, n)
    denied = is_write_denied(text)

    if intent == AgentIntent.DIET_RECORD:
        return {
            "date": d,
            "meal": infer_meal(text),
            "items": extract_diet_items(text),
            "hasImages": has_images,
            "writeDenied": denied,
        }
    if intent == AgentIntent.TRAINING_RECORD:
        return {"date": d, "writeDenied": denied, **parse_training_record(text)}
    if intent == AgentIntent.TRAINING_PLAN_CREATE:
        return {"date": d, "writeDenied": denied, **parse_training_plan(text)}
    if intent == AgentIntent.TRAINING_PLAN_UPDATE:
        return {"date": d, "writeDenied": denied, **parse_plan_update(text)}
    if intent == AgentIntent.BODY_ANALYSIS:
        parsed = parse_body_metrics(text)
        return {
            "date": d, "hasImages": has_images, "writeDenied": denied,
            **parsed["slots"], "metrics": parsed["metrics"],
        }
    if intent == AgentIntent.DIET_SUGGESTION:
        return {"date": d, "topic": text, "hasImages": has_images, "writeDenied": denied}
    return {}


__all__ = [
    "parse_chinese_number",
    "first_number",
    "extract_date",
    "infer_meal",
    "extract_diet_items",
    "extract_exercise_name",
    "parse_training_record",
    "parse_training_plan",
    "parse_plan_update",
    "parse_body_metrics",
    "is_write_denied",
    "parse_slots",
]
