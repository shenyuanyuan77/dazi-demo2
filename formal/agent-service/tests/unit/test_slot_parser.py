"""槽位解析器测试 — 1:1 校对 Node slot_parser.js 的行为。

迁移铁律: 任何抽取规则漂移都会导致双轨期 Python 与 Node 对同一句话产生不同 PendingWrite。
"""

from datetime import date

import pytest

from app.nodes.slot_parser import (
    extract_diet_items,
    extract_exercise_name,
    first_number,
    infer_meal,
    is_write_denied,
    parse_body_metrics,
    parse_chinese_number,
    parse_plan_update,
    parse_slots,
    parse_training_plan,
    parse_training_record,
)
from app.types.agent_types import AgentIntent


# ---------- 中文数字 ----------
@pytest.mark.parametrize("text,expected", [
    ("十", 10), ("十一", 11), ("二十", 20), ("二十三", 23),
    ("5", 5), ("3.5", 3.5), ("两", 2), ("八", 8),
])
def test_parse_chinese_number(text, expected):
    assert parse_chinese_number(text) == expected


def test_parse_chinese_number_nan():
    assert parse_chinese_number("xyz") != parse_chinese_number("xyz")  # NaN


# ---------- first_number ----------
def test_first_number_arabic():
    assert first_number("做了4组", r"(\d+(?:\.\d+)?)\s*组") == 4


def test_first_number_chinese():
    assert first_number("做了四组", r"([\d.]+|[一二两三四五六七八九十]{1,3})\s*组") == 4


def test_first_number_miss():
    assert first_number("没数字", r"(\d+)\s*组") is None


# ---------- 餐次 ----------
@pytest.mark.parametrize("text,expected", [
    ("早餐吃了鸡蛋", "breakfast"),
    ("午饭吃了米饭", "lunch"),
    ("晚饭吃了很多", "dinner"),
    ("加餐吃了香蕉", "snack"),
    ("喝了奶茶", "snack"),
    ("随便吃的", ""),
])
def test_infer_meal(text, expected):
    assert infer_meal(text) == expected


# ---------- 饮食项 ----------
def test_extract_diet_items_known():
    items = extract_diet_items("早餐吃了鸡胸肉和鸡蛋")
    names = [i["name"] for i in items]
    assert "鸡胸肉" in names and "鸡蛋" in names
    assert all(i["confidence"] >= 0.6 for i in items)


def test_extract_diet_items_milk_tea_unit():
    items = extract_diet_items("喝了奶茶")
    assert items[0]["name"] == "奶茶"
    assert items[0]["unit"] == "杯"


def test_extract_diet_items_noodle_unit():
    items = extract_diet_items("吃了牛肉面")
    assert items[0]["unit"] == "碗"


def test_extract_diet_items_fallback_split():
    items = extract_diet_items("吃了三明治、沙拉")
    # 未知食物走 fallback, 按分隔符切
    assert len(items) == 2
    assert items[0]["name"] == "三明治"
    assert items[0]["confidence"] < 0.6


def test_extract_diet_items_empty():
    assert extract_diet_items("记一下") == []


# ---------- 训练记录 ----------
def test_parse_training_record_full():
    s = parse_training_record("今天深蹲4组每组8次60公斤")
    item = s["items"][0]
    assert item["exerciseName"] == "深蹲"
    assert item["sets"] == 4
    assert item["reps"] == 8
    assert item["weightKg"] == 60


def test_parse_training_record_duration():
    s = parse_training_record("跑步30分钟")
    assert s["items"][0]["exerciseName"] == "跑步"
    assert s["items"][0]["durationMin"] == 30


def test_parse_training_record_distance():
    s = parse_training_record("跑了5公里")
    assert s["items"][0]["exerciseName"] == "跑步"
    assert s["items"][0]["distanceKm"] == 5


def test_parse_training_record_unknown_exercise():
    s = parse_training_record("做了个奇怪动作3组")
    assert s["items"][0]["exerciseName"] == "训练"


def test_extract_exercise_name_ran():
    assert extract_exercise_name("今天跑了5km") == "跑步"


# ---------- 训练计划 ----------
def test_parse_training_plan_muscle_gain():
    s = parse_training_plan("帮我安排增肌训练计划每周练4天")
    assert s["goal"] == "增肌"
    assert s["daysPerWeek"] == 4
    assert s["planName"] == "增肌训练计划"
    assert len(s["exercises"]) >= 3


def test_parse_training_plan_dumbbell():
    s = parse_training_plan("用哑铃安排训练")
    assert "哑铃" in s["equipment"]
    assert any("哑铃" in e["name"] for e in s["exercises"])


def test_parse_training_plan_fat_loss_bodyweight():
    s = parse_training_plan("减脂居家徒手训练")
    assert s["goal"] == "减脂"
    assert "徒手" in s["equipment"]
    # 减脂默认计划含快走慢跑
    assert any("快走" in e["name"] for e in s["exercises"])


def test_parse_plan_update_change():
    s = parse_plan_update("把深蹲改成6组")
    assert s["operation"] == "replace"
    assert s["replacement"] == "6组"


def test_parse_plan_update_halve():
    s = parse_plan_update("训练量减半")
    assert s["operation"] == "reduce_volume"


def test_parse_plan_update_target_day():
    s = parse_plan_update("明天训练改成有氧")
    assert s["targetDay"] == "tomorrow"


# ---------- 身体数据 ----------
def test_parse_body_metrics_full():
    r = parse_body_metrics("我175cm 70公斤 体脂18%")
    assert r["metrics"]["heightCm"] == 175
    assert r["metrics"]["weightKg"] == 70
    assert r["metrics"]["bodyFatRate"] == 18


def test_parse_body_metrics_jin():
    r = parse_body_metrics("我140斤")
    assert r["slots"]["weightJin"] == 140
    assert r["slots"]["weightKg"] == 70.0


def test_parse_body_metrics_height_out_of_range():
    # 50cm 不在 80-230 -> 不抽
    r = parse_body_metrics("我50cm")
    assert "heightCm" not in r["metrics"]


# ---------- writeDenied ----------
@pytest.mark.parametrize("text,expected", [
    ("不用记录", True),
    ("不要保存", True),
    ("只分析一下", True),
    ("先别记上", True),
    ("帮我记录", False),
    ("分析一下", False),
])
def test_is_write_denied(text, expected):
    assert is_write_denied(text) is expected


# ---------- parse_slots 总入口 ----------
def test_parse_slots_diet_record():
    s = parse_slots(AgentIntent.DIET_RECORD, "早餐吃了鸡胸肉", now=date(2026, 8, 8))
    assert s["meal"] == "breakfast"
    assert s["date"] == "2026-08-08"
    assert any(i["name"] == "鸡胸肉" for i in s["items"])
    assert s["writeDenied"] is False


def test_parse_slots_training_record():
    s = parse_slots(AgentIntent.TRAINING_RECORD, "深蹲4组")
    assert s["items"][0]["exerciseName"] == "深蹲"


def test_parse_slots_diet_suggestion():
    s = parse_slots(AgentIntent.DIET_SUGGESTION, "减脂期能吃多少碳水")
    assert s["topic"] == "减脂期能吃多少碳水"


def test_parse_slots_unknown_intent_empty():
    s = parse_slots(AgentIntent.UNSUPPORTED, "随便说")
    assert s == {}


def test_parse_slots_body_analysis_with_metrics():
    s = parse_slots(AgentIntent.BODY_ANALYSIS, "我70kg 体脂20%")
    assert s["metrics"]["weightKg"] == 70
    assert s["metrics"]["bodyFatRate"] == 20


def test_parse_slots_date_tomorrow():
    s = parse_slots(AgentIntent.DIET_RECORD, "明天早餐吃了蛋", now=date(2026, 8, 8))
    assert s["date"] == "2026-08-09"
