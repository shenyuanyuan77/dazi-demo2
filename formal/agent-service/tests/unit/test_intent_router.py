"""意图识别测试 — 规则主路径 + LLM router JSON 解析.

覆盖验收 §7.1 意图识别矩阵的关键分支.
"""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.nodes.intent_router import (
    _parse_llm_intent_json,
    is_cancel,
    is_confirmation,
    is_write_denied,
    recognize_intent_llm,
    recognize_intent_rule,
)
from app.types.agent_types import AgentIntent


# ============================================================
# 基础判定函数 (M1 已覆盖部分, 这里补齐边界)
# ============================================================
@pytest.mark.parametrize("text", ["确认", "可以", "保存吧", "对吧", "没问题", "就这样"])
def test_is_confirmation_hits(text):
    assert is_confirmation(text)


@pytest.mark.parametrize("text", ["取消", "不要了", "算了", "否", "不保存吧", "先别"])
def test_is_cancel_hits(text):
    assert is_cancel(text)


@pytest.mark.parametrize("text", ["确认一下就好", "嗯"])
def test_is_confirmation_miss(text):
    assert not is_confirmation(text)


def test_is_write_denied():
    assert is_write_denied("不用记录")
    assert is_write_denied("只分析一下")
    assert not is_write_denied("帮我记录")


# ============================================================
# 规则主路径: 确认/取消优先级
# ============================================================
def test_cancel_priority_over_unsupported():
    g = recognize_intent_rule("取消", has_images=False, pending_write_exists=False)
    assert g.intent == AgentIntent.CANCEL_WRITE


def test_confirm_with_pending_write():
    g = recognize_intent_rule("确认", has_images=False, pending_write_exists=True)
    assert g.intent == AgentIntent.CONFIRM_WRITE
    assert g.confidence == 0.99


def test_confirm_without_pending_write():
    g = recognize_intent_rule("确认", has_images=False, pending_write_exists=False)
    assert g.intent == AgentIntent.CONFIRM_WRITE
    assert g.confidence < 0.99


# ============================================================
# 越界拒答
# ============================================================
@pytest.mark.parametrize("text", [
    "帮我写论文", "预测股票", "查天气", "翻译这段", "做个PPT",
    "旅游攻略", "星座运势", "写代码", "电影推荐",
])
def test_out_of_scope_keyword(text):
    g = recognize_intent_rule(text, has_images=False, pending_write_exists=False)
    assert g.intent == AgentIntent.UNSUPPORTED
    assert g.reason == "unsupported_keyword"


# ============================================================
# 业务领域强信号 (DIET/TRAINING/BODY)
# ============================================================
@pytest.mark.parametrize("text", [
    "早餐吃了鸡蛋", "记一下午餐", "喝了奶茶", "吃了鸡胸肉",
])
def test_domain_diet_record(text):
    g = recognize_intent_rule(text, has_images=False, pending_write_exists=False)
    assert g.intent == AgentIntent.DIET_RECORD


@pytest.mark.parametrize("text", [
    "减脂期怎么吃", "能吃多少碳水", "高蛋白食物", "控糖建议",
])
def test_domain_diet_suggestion(text):
    g = recognize_intent_rule(text, has_images=False, pending_write_exists=False)
    assert g.intent == AgentIntent.DIET_SUGGESTION


@pytest.mark.parametrize("text", [
    "安排训练计划", "帮我制定每周练4天的计划", "居家训练",
])
def test_domain_training_plan_create(text):
    g = recognize_intent_rule(text, has_images=False, pending_write_exists=False)
    assert g.intent == AgentIntent.TRAINING_PLAN_CREATE


@pytest.mark.parametrize("text", [
    "深蹲改成6组", "把卧推换成硬拉",
])
def test_domain_training_plan_update(text):
    g = recognize_intent_rule(text, has_images=False, pending_write_exists=False)
    assert g.intent == AgentIntent.TRAINING_PLAN_UPDATE


@pytest.mark.parametrize("text", [
    "我体重70kg", "体脂18%怎么减", "BMI多少正常",
])
def test_domain_body_analysis(text):
    g = recognize_intent_rule(text, has_images=False, pending_write_exists=False)
    assert g.intent == AgentIntent.BODY_ANALYSIS


# ============================================================
# writeDenied 把 record 降级为 suggestion/analysis
# ============================================================
def test_write_denied_food_becomes_suggestion():
    g = recognize_intent_rule("吃了鸡胸肉但不用记录", has_images=False, pending_write_exists=False)
    assert g.intent == AgentIntent.DIET_SUGGESTION
    assert g.reason == "domain_with_write_denied"


def test_write_denied_body_becomes_analysis_readonly():
    g = recognize_intent_rule("体脂18%只分析", has_images=False, pending_write_exists=False)
    assert g.intent == AgentIntent.BODY_ANALYSIS


# ============================================================
# 图片强信号
# ============================================================
def test_food_image_routes_to_diet_record():
    g = recognize_intent_rule("这餐吃了啥", has_images=True, pending_write_exists=False)
    assert g.intent == AgentIntent.DIET_RECORD


def test_body_scale_image_routes_to_body_analysis():
    g = recognize_intent_rule("这是体脂秤截图", has_images=True, pending_write_exists=False)
    assert g.intent == AgentIntent.BODY_ANALYSIS


# ============================================================
# 训练记录组合 (动作 + 量词)
# ============================================================
def test_training_record_combo():
    g = recognize_intent_rule("今天深蹲4组8次", has_images=False, pending_write_exists=False)
    assert g.intent == AgentIntent.TRAINING_RECORD


# ============================================================
# 模糊表达 -> None (交给 LLM)
# ============================================================
def test_fuzzy_utterance_returns_none():
    g = recognize_intent_rule("今天馋炸鸡又怕胖", has_images=False, pending_write_exists=False)
    assert g is None


def test_empty_message_no_image_returns_none():
    assert recognize_intent_rule("", has_images=False, pending_write_exists=False) is None


# ============================================================
# LLM router JSON 解析
# ============================================================
def test_parse_llm_intent_json_plain():
    intent, conf, reason = _parse_llm_intent_json('{"intent":"DIET_RECORD","confidence":0.9,"reason":"x"}')
    assert intent == AgentIntent.DIET_RECORD
    assert conf == 0.9
    assert reason == "llm_router"


def test_parse_llm_intent_json_markdown_wrapped():
    raw = '```json\n{"intent":"TRAINING_PLAN_CREATE","confidence":0.85}\n```'
    intent, _, _ = _parse_llm_intent_json(raw)
    assert intent == AgentIntent.TRAINING_PLAN_CREATE


def test_parse_llm_intent_json_with_prose():
    raw = '好的，分析结果是 {"intent":"BODY_ANALYSIS","confidence":0.8} 希望有帮助'
    intent, _, _ = _parse_llm_intent_json(raw)
    assert intent == AgentIntent.BODY_ANALYSIS


def test_parse_llm_intent_json_invalid():
    intent, conf, _ = _parse_llm_intent_json("not json at all")
    assert intent == AgentIntent.UNSUPPORTED
    assert conf < 0.5


def test_parse_llm_intent_rejects_confirm_cancel():
    # LLM 不允许出 CONFIRM/CANCEL (那是规则的领地)
    intent, _, reason = _parse_llm_intent_json('{"intent":"CONFIRM_WRITE","confidence":0.99}')
    assert intent == AgentIntent.UNSUPPORTED
    assert reason == "llm_intent_out_of_scope"


def test_parse_llm_intent_clamps_confidence():
    _, conf, _ = _parse_llm_intent_json('{"intent":"DIET_RECORD","confidence":1.5}')
    assert conf == 1.0
    _, conf, _ = _parse_llm_intent_json('{"intent":"DIET_RECORD","confidence":-0.3}')
    assert conf == 0.0


# ============================================================
# recognize_intent_llm 集成 (mock LLM)
# ============================================================
@pytest.mark.asyncio
async def test_recognize_intent_llm_success():
    mock_resp = MagicMock()
    mock_resp.content = '{"intent":"DIET_SUGGESTION","confidence":0.88,"reason":"llm"}'
    llm = MagicMock()
    llm.ainvoke = AsyncMock(return_value=mock_resp)
    g = await recognize_intent_llm("减脂期吃什么", has_images=False, llm=llm)
    assert g.intent == AgentIntent.DIET_SUGGESTION
    assert g.reason == "llm_router"


@pytest.mark.asyncio
async def test_recognize_intent_llm_failure_falls_back():
    llm = MagicMock()
    llm.ainvoke = AsyncMock(side_effect=RuntimeError("network down"))
    g = await recognize_intent_llm("随便说点什么", has_images=False, llm=llm)
    # 降级到规则兜底 UNSUPPORTED
    assert g.intent == AgentIntent.UNSUPPORTED
    assert g.confidence < 0.7
