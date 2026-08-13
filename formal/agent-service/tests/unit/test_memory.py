"""记忆系统测试 — short_term / user_profile / procedural / policy.

覆盖验收 §11 Memory (读取/更新/不错误覆盖/多用户隔离).
"""

import pytest

from app.memory import (
    MEMORY_POLICY,
    append_turn,
    classify_memory_update,
    get_procedural_rules,
    normalize_user_profile,
)
from app.types.agent_types import PendingWriteStatus, PendingWriteType


# ---------- short_term_memory ----------
def test_append_turn_basic():
    mem = append_turn([], "你好", "你好，有什么可以帮你？")
    assert len(mem) == 2
    assert mem[0]["role"] == "user"
    assert mem[1]["role"] == "assistant"


def test_append_turn_truncates():
    long_msg = "x" * 2000
    mem = append_turn([], long_msg, "")
    assert len(mem[0]["content"]) == 1200


def test_append_turn_cap_24():
    mem = []
    for i in range(30):
        mem = append_turn(mem, f"u{i}", f"a{i}")
    assert len(mem) <= 24


def test_append_turn_empty_skipped():
    mem = append_turn([], "", "")
    assert mem == []


def test_append_turn_has_timestamp():
    mem = append_turn([], "hi", "hello")
    assert "at" in mem[0]
    assert "at" in mem[1]


# ---------- user_profile_memory ----------
def test_normalize_profile_rounds_weight():
    p = normalize_user_profile({"weightKg": 70.456, "heightCm": 175.4})
    assert p["weightKg"] == 70.5
    assert p["heightCm"] == 175


def test_normalize_profile_drops_none():
    p = normalize_user_profile({"goal": "减脂", "weightKg": None})
    assert "weightKg" not in p
    assert p["goal"] == "减脂"


def test_normalize_profile_empty():
    assert normalize_user_profile(None) == {}
    assert normalize_user_profile({}) == {}


def test_normalize_profile_nested():
    p = normalize_user_profile({"dietPreferences": {"fruit": None, "meat": "chicken"}})
    assert "fruit" not in p["dietPreferences"]
    assert p["dietPreferences"]["meat"] == "chicken"


def test_normalize_profile_invalid_number_kept():
    p = normalize_user_profile({"weightKg": "abc"})
    # 不应抛, 保留原值
    assert "weightKg" in p


# ---------- procedural_memory ----------
def test_procedural_rules_nonempty():
    rules = get_procedural_rules()
    assert len(rules) >= 5
    assert any("pendingWrite" in r for r in rules)


def test_procedural_rules_returns_copy():
    r1 = get_procedural_rules()
    r2 = get_procedural_rules()
    assert r1 == r2
    assert r1 is not r2  # 不是同一引用


# ---------- memory_policy ----------
def test_memory_policy_user_profile_fields():
    fields = MEMORY_POLICY["userProfile"]
    assert "heightCm" in fields
    assert "goal" in fields
    assert "weightKg" in fields


def test_memory_policy_episodic_targets():
    targets = MEMORY_POLICY["episodicTargets"]
    assert targets["dietLogs"] == PendingWriteType.DIET_LOG
    assert targets["trainingLogs"] == PendingWriteType.TRAINING_LOG


def test_memory_policy_forbidden_long_term():
    forbidden = MEMORY_POLICY["forbiddenLongTerm"]
    assert "toolFailure" in forbidden
    assert "smallTalk" in forbidden


# ---------- classify_memory_update ----------
class _FakePW:
    def __init__(self, pw_type, data=None):
        self.type = pw_type
        self.data = data or {}


def test_classify_diet_log():
    updates = classify_memory_update(_FakePW(PendingWriteType.DIET_LOG, {"items": []}))
    assert len(updates) == 1
    assert updates[0]["target"] == "dietLogs"
    assert updates[0]["action"] == "pending_create"
    assert updates[0]["requiresConfirmation"] is True


def test_classify_training_log():
    updates = classify_memory_update(_FakePW(PendingWriteType.TRAINING_LOG))
    assert updates[0]["target"] == "trainingLogs"


def test_classify_training_plan():
    updates = classify_memory_update(_FakePW(PendingWriteType.TRAINING_PLAN))
    assert updates[0]["target"] == "trainingPlans"
    assert updates[0]["action"] == "pending_upsert"


def test_classify_body_metric():
    updates = classify_memory_update(_FakePW(PendingWriteType.BODY_METRIC))
    assert updates[0]["target"] == "bodyMetrics"


def test_classify_user_profile():
    updates = classify_memory_update(_FakePW(PendingWriteType.USER_PROFILE, {"goal": "减脂"}))
    assert updates[0]["target"] == "userProfile"
    assert updates[0]["action"] == "pending_update"


def test_classify_none():
    assert classify_memory_update(None) == []


def test_classify_unknown_type():
    assert classify_memory_update(_FakePW("unknown_type")) == []


# ---------- 多用户隔离 (验收 §11.5) ----------
def test_short_term_memory_isolated():
    """短期记忆是 session 级 list, 不共享 -> 天然隔离。"""
    mem_a = append_turn([], "用户A的话", "回复A")
    mem_b = append_turn([], "用户B的话", "回复B")
    assert mem_a[0]["content"] == "用户A的话"
    assert mem_b[0]["content"] == "用户B的话"
    assert mem_a != mem_b
