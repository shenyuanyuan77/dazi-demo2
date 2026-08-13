# 意图识别 — 规则兜底 + LLM router 主路径.
#
# 设计分层 (优先级从高到低):
#   1. 确认/取消 (CONFIRM/CANCEL) — 直接命中, 优先级高于一切
#   2. 越界关键词 (UNSUPPORTED) — 命中即拦, 不进 LLM
#   3. 业务领域强信号 (DIET/TRAINING/BODY) — 命中即路由, 不进 LLM
#   4. 图片强信号 — 视觉分支
#   5. 兜底正则组合 — 命中即路由
#   6. 以上都不命中 -> recognize_intent_llm() 调 MiMo fast 做意图分类
#
# 迁移铁律: 1-5 与 Node intent_parser.js 严格对齐 (双轨期判定必须一致)。
# 6 是 Python 新增的 LLM 主路径 (M2)。

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any

from app.types.agent_types import (
    AgentIntent,
    CANCEL_WORDS,
    CONFIRMATION_WORDS,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class IntentGuess:
    intent: AgentIntent
    confidence: float
    reason: str


# ============================================================
# 越界 / 写拒绝 正则 — 1:1 移植
# ============================================================
_OUT_OF_SCOPE_PATTERNS = [
    re.compile(r"写(论文|文章|代码|情书|文案)"),
    re.compile(r"旅游攻略"),
    re.compile(r"股市|股票|投资|基金|彩票"),
    re.compile(r"星座"),
    re.compile(r"天气"),
    re.compile(r"电影推荐"),
    re.compile(r"编程"),
    re.compile(r"做(?:个|份)?PPT", re.IGNORECASE),
    re.compile(r"翻译"),
    re.compile(r"合同|法律"),
]

_WRITE_DENIED_PATTERN = re.compile(
    r"(不用|不要|无需|先别).{0,8}(记录|保存|写入|记上)"
    r"|只.{0,8}(分析|看看|建议|评估)"
    r"|不.{0,4}(保存|写入|记录)"
)


# 业务领域强信号 (Node BUSINESS_DOMAIN_SIGNALS)
_BUSINESS_DOMAIN_SIGNALS: list[tuple[AgentIntent, re.Pattern[str]]] = [
    # 1. DIET_SUGGESTION 最优先: 咨询词不被"吃了"抢
    (AgentIntent.DIET_SUGGESTION, re.compile(r"能吃多少|还剩多少|怎么吃|吃什么|怎么选|能不能吃|补蛋白|高蛋白|低脂|控糖|饮食注意|补给建议|喝多少水|推荐量是多少|膳食指南|搭配.*营养|蛋白质.*摄入|高血压.*饮食|碳水比例|钠.*摄入|膳食纤维|维生素.*补|钙.*食物|多久吃东西|增重怎么吃")),
    # 2. PLAN_UPDATE/CREATE 必须在 TRAINING_RECORD 前: "改成/安排"比"深蹲"更具体
    (AgentIntent.TRAINING_PLAN_UPDATE, re.compile(r"改成|换成|调整|把.{0,8}改成|把.{0,8}换成|训练计划.*调整|太累.*调整")),
    (AgentIntent.TRAINING_PLAN_CREATE, re.compile(r"练什么|怎么练|训练计划|每周练|居家训练|帮我安排|安排训练|定制训练|安排.*计划|制定.*计划|推拉腿|分化训练|新手.*训练|练腿计划|练胸|练背|练肩")),
    # 3. TRAINING_RECORD 在 DIET_RECORD 前: 动作词比"记一下"更具体
    (AgentIntent.TRAINING_RECORD, re.compile(r"深蹲|卧推|硬拉|划船|跑步|跑了|推举|俯卧撑|引体|卷腹|平板支撑|跳绳|游泳|骑行|练了.*组|训练完成|训练.*\d组|全身训练|胸部训练|背部训练|腿部训练|肩部训练|手臂训练|核心训练|完成.*训练|记一下训练")),
    (AgentIntent.DIET_RECORD, re.compile(r"吃了|喝了|记一下|记录一下|早餐吃|午餐吃|晚餐吃|加餐吃|喝了一杯|吃了半碗|吃了\d|喝了\d|记录这顿|记录午餐|记录早餐")),
    (AgentIntent.TRAINING_RECORD, re.compile(r"深蹲|卧推|硬拉|划船|跑步|跑了|推举|俯卧撑|引体|卷腹|平板支撑|跳绳|游泳|骑行|练了.*组|训练完成|训练.*\d组|全身训练|胸部训练|背部训练|腿部训练|肩部训练|手臂训练|核心训练|完成.*训练|记一下训练")),
    (AgentIntent.BODY_ANALYSIS, re.compile(r"体脂|体重|BMI|身高|身体数据|腰围|臀围|胸围|内脏脂肪|水分率|肌肉量|基础代谢")),
]


# ============================================================
# 基础判定函数
# ============================================================
def _has_any(text: str, patterns: list[re.Pattern[str]]) -> bool:
    return any(p.search(text) for p in patterns)


def _has_keywords(text: str, kws: list[str]) -> bool:
    return any(k in text for k in kws)


def is_confirmation(text: str) -> bool:
    clean = re.sub(r"\s+", "", text)
    if any(
        clean == w or clean == f"{w}吧" or clean == f"{w}保存"
        for w in CONFIRMATION_WORDS
    ):
        return True
    # 扩展: 确认写入 / 可以了 / 对的 / 是 / 好的 / 行 / 嗯确认
    return clean in ("确认写入", "可以了", "对的", "是", "好的", "行", "嗯确认", "确认一下", "确认无误", "就这样了", "保存就好", "就这样确认")


def is_cancel(text: str) -> bool:
    clean = re.sub(r"\s+", "", text)
    if any(
        clean == w or clean == f"{w}了" or clean == f"{w}吧"
        for w in CANCEL_WORDS
    ):
        return True
    # 扩展: 取消保存/不用保存/取消记录/不用记了/取消这条/不写入了/先不用/先不要
    return clean in (
        "取消保存", "不用保存", "取消记录", "不用记了",
        "不要记了", "取消这条", "不写入了", "先不用", "先不要",
        "取消吧", "不用了吧",
    )


def is_write_denied(text: str) -> bool:
    return bool(_WRITE_DENIED_PATTERN.search(text))


def _detect_business_intent(text: str) -> AgentIntent | None:
    for intent, pattern in _BUSINESS_DOMAIN_SIGNALS:
        if pattern.search(text):
            return intent
    return None


# ============================================================
# 规则兜底 — 对应 Node recognizeIntent 的 1-5 步
# ============================================================
def recognize_intent_rule(
    message: str, *, has_images: bool, pending_write_exists: bool
) -> IntentGuess | None:
    """规则式意图识别 (硬兜底)。返回 None 表示规则没把握, 应交给 LLM router。"""
    text = (message or "").strip()
    if not text and not has_images:
        return None

    # 1. 确认/取消 - 最高优先级 (包括 UNSUPPORTED 也能被 cancel 命中)
    if is_cancel(text):
        return IntentGuess(AgentIntent.CANCEL_WRITE, 0.98, "cancel_word")
    if is_confirmation(text):
        conf = 0.99 if pending_write_exists else 0.92
        return IntentGuess(
            AgentIntent.CONFIRM_WRITE, conf,
            "confirm_pending_write" if pending_write_exists else "confirm_without_pending_write",
        )

    # 2. 越界关键词 - 直接拦
    if _has_any(text, _OUT_OF_SCOPE_PATTERNS):
        return IntentGuess(AgentIntent.UNSUPPORTED, 0.96, "unsupported_keyword")

    # 3. 业务领域强信号
    write_denied = is_write_denied(text)
    domain = _detect_business_intent(text)
    if domain is not None:
        if write_denied and domain in (AgentIntent.DIET_RECORD, AgentIntent.TRAINING_RECORD):
            safe = AgentIntent.DIET_SUGGESTION if domain == AgentIntent.DIET_RECORD else AgentIntent.BODY_ANALYSIS
            return IntentGuess(safe, 0.92, "domain_with_write_denied")
        reason_map = {
            AgentIntent.DIET_RECORD: "domain_signal_food",
            AgentIntent.TRAINING_RECORD: "domain_signal_training",
            AgentIntent.TRAINING_PLAN_CREATE: "domain_signal_plan",
            AgentIntent.TRAINING_PLAN_UPDATE: "domain_signal_plan",
            AgentIntent.BODY_ANALYSIS: "domain_signal_body",
            AgentIntent.DIET_SUGGESTION: "domain_signal_diet_advice",
        }
        conf_map = {
            AgentIntent.DIET_RECORD: 0.93,
            AgentIntent.TRAINING_RECORD: 0.92,
            AgentIntent.TRAINING_PLAN_CREATE: 0.9,
            AgentIntent.TRAINING_PLAN_UPDATE: 0.9,
            AgentIntent.BODY_ANALYSIS: 0.9,
            AgentIntent.DIET_SUGGESTION: 0.9,
        }
        return IntentGuess(domain, conf_map[domain], reason_map[domain])

    # 4. writeDenied + 读类信号
    if write_denied and _has_any(text, [re.compile(r"吃|喝|餐|食物|饮食|热量|蛋白|外卖|早餐|午餐|晚餐")]):
        return IntentGuess(AgentIntent.DIET_SUGGESTION, 0.93, "food_read_only")
    if write_denied and _has_any(text, [re.compile(r"体重|体脂|BMI|bmi|身体数据|身高|围度|截图|体脂秤")]):
        return IntentGuess(AgentIntent.BODY_ANALYSIS, 0.93, "body_read_only")

    # 5. 图片强信号
    if has_images and _has_keywords(text, ["体脂秤", "body_scale", "体重秤", "身体数据", "体脂", "截图", "体脂数据", "身体成分", "称重", "健康数据", "体脂秤读数"]):
        return IntentGuess(AgentIntent.BODY_ANALYSIS, 0.95, "body_image")
    if has_images and _has_keywords(text, ["食物", "餐", "吃", "喝", "饮食", "热量", "记录", "识别", "图里", "这顿", "看看", "多少卡", "拍照", "图片", "午餐", "晚餐", "早餐"]):
        return IntentGuess(AgentIntent.DIET_RECORD, 0.94, "food_image")

    # 6. 训练计划调整 / 制定
    if _has_any(text, [re.compile(r"改成|换成|不练|训练量.*(减半|减少|增加)|把周[一二三四五六日天].*(训练|计划)|调整.*训练")]):
        return IntentGuess(AgentIntent.TRAINING_PLAN_UPDATE, 0.9, "training_plan_update")
    if _has_any(text, [re.compile(r"制定.*训练计划|训练计划|每周练|怎么练|安排.*训练|居家训练|增肌.*安排|减脂.*训练")]):
        return IntentGuess(AgentIntent.TRAINING_PLAN_CREATE, 0.88, "training_plan_create")

    # 7. 训练记录组合
    if _has_any(text, [re.compile(r"卧推|深蹲|硬拉|跑步|跑了|划船|推举|俯卧撑|引体|卷腹|平板支撑|有氧|跳绳|游泳|骑行|椭圆机|箭步蹲|臀桥")]) and \
       _has_any(text, [re.compile(r"组|次|个|分钟|公里|kg|公斤|千克|做了|记录|今天")]):
        return IntentGuess(AgentIntent.TRAINING_RECORD, 0.9, "training_record")

    # 8. 饮食建议/记录
    if _has_any(text, [re.compile(r"还能吃多少|热量|晚饭吃什么|午饭吃什么|早餐吃什么|(早餐|午餐|晚餐|加餐).{0,8}建议|补蛋白|饮食建议|减脂期.*吃|今天吃了这些|高蛋白|低脂|控糖|外卖.*怎么选")]) and \
       not _has_any(text, [re.compile(r"记录|记一下|帮我记|刚才喝|早餐吃(?!什么)|午餐有(?!什么)|晚餐有(?!什么)")]):
        return IntentGuess(AgentIntent.DIET_SUGGESTION, 0.87, "diet_suggestion")
    if _has_any(text, [re.compile(r"早餐|午餐|晚餐|加餐|吃了|喝了|奶茶|牛肉面|米饭|鸡胸|青菜|饮食.*记录|记一下|记录一下")]):
        return IntentGuess(AgentIntent.DIET_RECORD, 0.9, "diet_record")

    # 9. 身体数据
    if _has_any(text, [re.compile(r"体脂|体重|BMI|bmi|身高|斤|公斤|kg|分析.*身体|怎么减脂")]):
        return IntentGuess(AgentIntent.BODY_ANALYSIS, 0.84, "body_analysis")

    # 规则都没把握 -> None, 交给 LLM
    return None


def _fallback_guess() -> IntentGuess:
    """规则兜底 (无 LLM 时) 的最终归宿。"""
    return IntentGuess(AgentIntent.UNSUPPORTED, 0.62, "no_supported_intent")


# ============================================================
# LLM router 主路径 (M2 新增)
# ============================================================
_VALID_LLM_INTENTS = frozenset({
    AgentIntent.DIET_RECORD, AgentIntent.DIET_SUGGESTION,
    AgentIntent.TRAINING_PLAN_CREATE, AgentIntent.TRAINING_PLAN_UPDATE,
    AgentIntent.TRAINING_RECORD, AgentIntent.BODY_ANALYSIS,
    AgentIntent.UNSUPPORTED,
})


def _parse_llm_intent_json(raw: str) -> tuple[AgentIntent, float, str]:
    """从 LLM 返回文本里解析意图 JSON。

    MiMo 可能偶尔出 Markdown 包裹 -> 兼容剥壳。
    """
    text = (raw or "").strip()
    # 剥 ```json ... ```
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text).strip()
    # 抠出第一个 {...}
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if m:
        text = m.group(0)
    try:
        obj = json.loads(text)
    except json.JSONDecodeError:
        return AgentIntent.UNSUPPORTED, 0.3, "llm_json_parse_failed"
    intent_str = str(obj.get("intent", "")).upper().strip()
    try:
        intent = AgentIntent(intent_str)
    except ValueError:
        return AgentIntent.UNSUPPORTED, 0.3, "llm_unknown_intent"
    conf = float(obj.get("confidence", 0.7) or 0.7)
    conf = max(0.0, min(1.0, conf))
    if intent not in _VALID_LLM_INTENTS:
        # CONFIRM/CANCEL 不允许从 LLM 出 (那是规则的领地)
        return AgentIntent.UNSUPPORTED, 0.3, "llm_intent_out_of_scope"
    return intent, conf, "llm_router"


async def recognize_intent_llm(
    message: str,
    *,
    has_images: bool,
    llm: Any,
) -> IntentGuess:
    """调 fast LLM 做意图分类。

    ``llm`` 是 LangChain BaseChatModel (build_fast_llm 出品)。任何异常都降级到规则兜底。
    """
    from langchain_core.messages import HumanMessage, SystemMessage
    from app.nodes.prompt_builder import INTENT_ROUTER_SYSTEM, build_intent_router_user_prompt

    try:
        resp = await llm.ainvoke([
            SystemMessage(content=INTENT_ROUTER_SYSTEM),
            HumanMessage(content=build_intent_router_user_prompt(message, has_images=has_images)),
        ])
        raw = resp.content if isinstance(resp.content, str) else str(resp.content)
        intent, conf, reason = _parse_llm_intent_json(raw)
        return IntentGuess(intent, conf, reason)
    except Exception as e:  # noqa: BLE001 - LLM router 失败必须降级, 不能抛
        logger.warning("intent_llm_failed error=%s", e)
        return _fallback_guess()


__all__ = [
    "IntentGuess",
    "is_confirmation",
    "is_cancel",
    "is_write_denied",
    "recognize_intent_rule",
    "recognize_intent_llm",
]
