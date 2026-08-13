"""子 agent 构造器测试 — 验证 PendingWrite 结构与 reply 文本。

重点: PendingWrite.type / target / status / summary 必须与前端渲染协议严格对齐,
否则前端 _decorateProposal 解析失败。
"""

import pytest

from app.nodes import subagents
from app.types.agent_types import PendingWriteStatus, PendingWriteType


# ---------- Diet ----------
def test_diet_record_pending_structure():
    slots = {"date": "2026-08-08", "meal": "lunch", "items": [{"name": "鸡胸肉"}, {"name": "米饭"}]}
    pw = subagents.build_diet_record_pending(slots)
    assert pw.type == PendingWriteType.DIET_LOG
    assert pw.status == PendingWriteStatus.WAITING_CONFIRM
    assert pw.data["meal"] == "lunch"
    assert "鸡胸肉" in pw.summary_for_user
    assert pw.id.startswith("pending-write-")


def test_diet_record_pending_empty_items_image():
    slots = {"hasImages": True, "items": []}
    pw = subagents.build_diet_record_pending(slots)
    assert "图片餐食待核对" in pw.summary_for_user


def test_diet_record_reply_with_items():
    reply = subagents.build_diet_record_reply({"items": [{"name": "鸡蛋"}]})
    assert "鸡蛋" in reply
    assert "确认" in reply


def test_diet_record_reply_empty_no_image():
    reply = subagents.build_diet_record_reply({"items": []})
    assert "缺少" in reply or "补充" in reply


def test_diet_record_reply_image_no_items():
    reply = subagents.build_diet_record_reply({"items": [], "hasImages": True})
    assert "图片识别" in reply


def test_diet_suggestion_reply_with_calories():
    reply = subagents.build_diet_suggestion_reply(remaining_calories=500.4, advice="多吃蛋白")
    assert "500" in reply
    assert "多吃蛋白" in reply


def test_diet_suggestion_reply_no_calories():
    reply = subagents.build_diet_suggestion_reply(advice="注意碳水")
    assert "注意碳水" in reply


# ---------- Training log ----------
def test_training_log_pending_structure():
    slots = {"date": "2026-08-08", "items": [{"exerciseName": "深蹲", "sets": 4, "reps": 8}]}
    pw = subagents.build_training_log_pending(slots)
    assert pw.type == PendingWriteType.TRAINING_LOG
    assert "深蹲" in pw.summary_for_user
    assert "4 组" in pw.summary_for_user


def test_training_log_reply_full():
    reply = subagents.build_training_log_reply(
        {"items": [{"exerciseName": "深蹲", "sets": 5, "reps": 8, "weightKg": 80}]}
    )
    assert "深蹲" in reply
    assert "5 组" in reply
    assert "80 kg" in reply


def test_training_log_reply_no_exercise():
    reply = subagents.build_training_log_reply({"items": []})
    assert "缺少" in reply or "补充" in reply


def test_training_log_reply_duration():
    reply = subagents.build_training_log_reply(
        {"items": [{"exerciseName": "跑步", "durationMin": 30}]}
    )
    assert "30 分钟" in reply


# ---------- Training plan ----------
def test_training_plan_pending_create():
    slots = {"goal": "增肌", "daysPerWeek": 4, "exercises": [{"name": "深蹲"}]}
    pw = subagents.build_training_plan_pending(slots, "create")
    assert pw.type == PendingWriteType.TRAINING_PLAN
    assert pw.data["operation"] == "create"
    assert "增肌" in pw.summary_for_user


def test_training_plan_pending_update():
    slots = {"patch": {"operation": "replace"}}
    pw = subagents.build_training_plan_pending(slots, "update")
    assert pw.data["operation"] == "update"
    assert pw.summary_for_user == "训练计划修改"


def test_training_plan_reply_create():
    reply = subagents.build_training_plan_reply({"goal": "增肌", "daysPerWeek": 3, "equipment": ["哑铃"]}, "create")
    assert "增肌" in reply
    assert "3 天" in reply
    assert "哑铃" in reply


def test_training_plan_reply_update():
    reply = subagents.build_training_plan_reply({}, "update")
    assert "修改草稿" in reply


# ---------- Body ----------
def test_has_body_metrics_true():
    assert subagents.has_body_metrics({"metrics": {"weightKg": 70}})


def test_has_body_metrics_false():
    assert not subagents.has_body_metrics({"metrics": {}})


def test_body_metric_pending_structure():
    slots = {"date": "2026-08-08", "metrics": {"weightKg": 70, "bodyFatRate": 18}, "hasImages": False}
    pw = subagents.build_body_metric_pending(slots)
    assert pw.type == PendingWriteType.BODY_METRIC
    assert pw.data["source"] == "chat"
    assert "weightKg" in pw.summary_for_user


def test_body_metric_pending_image_source():
    pw = subagents.build_body_metric_pending({"metrics": {"weightKg": 70}, "hasImages": True})
    assert pw.data["source"] == "image"


def test_body_analysis_reply_with_metrics():
    reply = subagents.build_body_analysis_reply({"heightCm": 175, "weightKg": 70, "bodyFatRate": 18, "metrics": {"weightKg": 70}})
    assert "175 cm" in reply
    assert "确认后才会写入" in reply


def test_body_analysis_reply_no_metrics_advice():
    reply = subagents.build_body_analysis_reply({"metrics": {}}, advice="注意睡眠")
    assert "注意睡眠" in reply


def test_body_readonly_reply():
    reply = subagents.build_body_readonly_reply({"weightKg": 70})
    assert "不会写入" in reply


# ---------- Profile ----------
def test_profile_pending_structure():
    pw = subagents.build_profile_pending({"goal": "减脂"})
    assert pw.type == PendingWriteType.USER_PROFILE
    assert pw.data["profilePatch"]["goal"] == "减脂"


# ---------- Fallback ----------
def test_unsupported_reply_lists_capabilities():
    reply = subagents.build_unsupported_reply()
    assert "只支持" in reply
    assert "饮食记录" in reply
