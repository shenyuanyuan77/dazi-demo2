const { AgentIntent } = require("../../shared/types/agent_types.js");
const {
  CANCEL_WORDS,
  CONFIRMATION_WORDS
} = require("../bootstrap/agent.config.js");

function hasAny(text, patterns) {
  return patterns.some(pattern => (
    pattern instanceof RegExp ? pattern.test(text) : text.includes(pattern)
  ));
}

function isConfirmation(text) {
  const clean = text.replace(/\s+/g, "");
  return CONFIRMATION_WORDS.some(word => clean === word || clean === `${word}吧` || clean === `${word}保存`);
}

function isCancel(text) {
  const clean = text.replace(/\s+/g, "");
  return CANCEL_WORDS.some(word => (
    clean === word ||
    clean === `${word}了` ||
    clean === `${word}吧`
  ));
}

function isWriteDenied(text) {
  return /(不用|不要|无需|先别).{0,8}(记录|保存|写入|记上)|只.{0,8}(分析|看看|建议|评估)|不.{0,4}(保存|写入|记录)/.test(
    String(text || "")
  );
}

// 业务领域强信号：包含这些词时直接进入对应 intent，
// 用于在 confirm/cancel 与 unsupported 之间插入更"语义优先"的判定。
const BUSINESS_DOMAIN_SIGNALS = [
  // 1. DIET_SUGGESTION 最优先: 咨询词不被"吃了"抢
  { intent: AgentIntent.DIET_SUGGESTION,   regex: /能吃多少|还剩多少|怎么吃|吃什么|怎么选|能不能吃|补蛋白|高蛋白|低脂|控糖|是否超标|超标|还够多少|还能吃/ },
  // 2. PLAN_UPDATE/CREATE 必须在 TRAINING_RECORD 前: "改成/安排"比"深蹲"更具体
  { intent: AgentIntent.TRAINING_PLAN_UPDATE, regex: /改成|换成|调整|把.{0,8}改成|把.{0,8}换成/ },
  { intent: AgentIntent.TRAINING_PLAN_CREATE, regex: /练什么|怎么练|训练计划|每周练|居家训练|帮我安排|安排训练|定制训练/ },
  // 3. TRAINING_RECORD 在 DIET_RECORD 前: 动作词比"记一下"更具体
  { intent: AgentIntent.TRAINING_RECORD,   regex: /深蹲|卧推|硬拉|划船|跑步|跑了|推举|俯卧撑|引体|卷腹|平板支撑|跳绳|游泳|骑行/ },
  { intent: AgentIntent.DIET_RECORD,       regex: /吃了|喝了|记一下|记录一下|早餐吃|午餐吃|晚餐吃|加餐吃|喝了一杯|吃了半碗|吃了\d|喝了\d/ },
  { intent: AgentIntent.BODY_ANALYSIS,     regex: /体脂|体重|BMI|身高|身体数据|腰围|臀围|胸围|内脏脂肪|水分率/ }
];

function detectBusinessIntent(text) {
  for (const signal of BUSINESS_DOMAIN_SIGNALS) {
    if (signal.regex.test(text)) return signal.intent;
  }
  return null;
}

function recognizeIntent(message, options) {
  const text = String(message || "").trim();
  const hasImages = Boolean(options && options.hasImages);
  const pendingWrite = options && options.pendingWrite;
  const writeDenied = isWriteDenied(text);

  // 1. 确认 / 取消优先于一切（包括 unsupported），避免误把"确认"识别为股市问题。
  if (isCancel(text)) {
    return { intent: AgentIntent.CANCEL_WRITE, confidence: 0.98, reason: "cancel_word" };
  }
  if (isConfirmation(text)) {
    return {
      intent: AgentIntent.CONFIRM_WRITE,
      confidence: pendingWrite ? 0.99 : 0.92,
      reason: pendingWrite ? "confirm_pending_write" : "confirm_without_pending_write"
    };
  }

  // 2. 明显超出能力范围（财经、写作、天气…）直接返回 unsupported，
  //    不让业务领域信号把它们误判成饮食/训练意图。
  if (hasAny(text, [/写(论文|文章|代码|情书|文案)/, /旅游攻略/, /股市/, /股票/, /投资/, /基金/, /彩票/, /星座/, /天气/, /电影推荐/, /编程/, /做PPT/i, /翻译/, /合同/, /法律/])) {
    return { intent: AgentIntent.UNSUPPORTED, confidence: 0.96, reason: "unsupported_keyword" };
  }

  // 3. 业务语义优先：包含领域关键词就立即路由。
  const domainIntent = detectBusinessIntent(text);
  if (domainIntent) {
    if (writeDenied && (domainIntent === AgentIntent.DIET_RECORD || domainIntent === AgentIntent.TRAINING_RECORD)) {
      const safe = domainIntent === AgentIntent.DIET_RECORD ? AgentIntent.DIET_SUGGESTION : AgentIntent.BODY_ANALYSIS;
      return { intent: safe, confidence: 0.92, reason: "domain_with_write_denied" };
    }
    if (domainIntent === AgentIntent.DIET_RECORD && !writeDenied) {
      return { intent: AgentIntent.DIET_RECORD, confidence: 0.93, reason: "domain_signal_food" };
    }
    if (domainIntent === AgentIntent.TRAINING_RECORD && !writeDenied) {
      return { intent: AgentIntent.TRAINING_RECORD, confidence: 0.92, reason: "domain_signal_training" };
    }
    if (domainIntent === AgentIntent.TRAINING_PLAN_CREATE || domainIntent === AgentIntent.TRAINING_PLAN_UPDATE) {
      return { intent: domainIntent, confidence: 0.9, reason: "domain_signal_plan" };
    }
    if (domainIntent === AgentIntent.BODY_ANALYSIS) {
      return { intent: AgentIntent.BODY_ANALYSIS, confidence: 0.9, reason: "domain_signal_body" };
    }
    if (domainIntent === AgentIntent.DIET_SUGGESTION) {
      return { intent: AgentIntent.DIET_SUGGESTION, confidence: 0.9, reason: "domain_signal_diet_advice" };
    }
  }

  // 4. writeDenied 与读类意图的语义优先
  if (writeDenied && hasAny(text, [/吃|喝|餐|食物|饮食|热量|蛋白|外卖|早餐|午餐|晚餐/])) {
    return { intent: AgentIntent.DIET_SUGGESTION, confidence: 0.93, reason: "food_read_only" };
  }

  if (writeDenied && hasAny(text, [/体重|体脂|BMI|bmi|身体数据|身高|围度|截图|体脂秤/])) {
    return { intent: AgentIntent.BODY_ANALYSIS, confidence: 0.93, reason: "body_read_only" };
  }

  // 5. 图片强信号
  if (hasImages && hasAny(text, [/体脂秤|body_scale|体重秤|身体数据|体脂|截图/])) {
    return { intent: AgentIntent.BODY_ANALYSIS, confidence: 0.95, reason: "body_image" };
  }
  if (hasImages && hasAny(text, [/食物|餐|吃|喝|饮食|热量|记录|识别|图片|图里/])) {
    return { intent: AgentIntent.DIET_RECORD, confidence: 0.94, reason: "food_image" };
  }

  // 6. 训练计划调整 / 制定（兼容旧语义）
  if (hasAny(text, [/改成/, /换成/, /不练/, /训练量.*(减半|减少|增加)/, /把周[一二三四五六日天].*(训练|计划)/, /调整.*训练/])) {
    return { intent: AgentIntent.TRAINING_PLAN_UPDATE, confidence: 0.9, reason: "training_plan_update" };
  }

  if (hasAny(text, [/制定.*训练计划/, /训练计划/, /每周练/, /怎么练/, /安排.*训练/, /居家训练/, /增肌.*安排/, /减脂.*训练/])) {
    return { intent: AgentIntent.TRAINING_PLAN_CREATE, confidence: 0.88, reason: "training_plan_create" };
  }

  if (hasAny(text, [/卧推|深蹲|硬拉|跑步|跑了|划船|推举|俯卧撑|引体|卷腹|平板支撑|有氧|跳绳|游泳|骑行|椭圆机|箭步蹲|臀桥/]) &&
      hasAny(text, [/组|次|个|分钟|公里|kg|公斤|千克|做了|记录|今天/])) {
    return { intent: AgentIntent.TRAINING_RECORD, confidence: 0.9, reason: "training_record" };
  }

  if (hasAny(text, [/还能吃多少/, /热量/, /晚饭吃什么/, /午饭吃什么/, /早餐吃什么/, /(早餐|午餐|晚餐|加餐).{0,8}建议/, /补蛋白/, /饮食建议/, /减脂期.*吃/, /今天吃了这些/, /高蛋白/, /低脂/, /控糖/, /外卖.*怎么选/]) &&
      !hasAny(text, [/记录|记一下|帮我记|刚才喝|早餐吃(?!什么)|午餐有(?!什么)|晚餐有(?!什么)/])) {
    return { intent: AgentIntent.DIET_SUGGESTION, confidence: 0.87, reason: "diet_suggestion" };
  }

  if (hasAny(text, [/早餐|午餐|晚餐|加餐|吃了|喝了|奶茶|牛肉面|米饭|鸡胸|青菜|饮食.*记录|记一下|记录一下/])) {
    return { intent: AgentIntent.DIET_RECORD, confidence: 0.9, reason: "diet_record" };
  }

  if (hasAny(text, [/体脂|体重|BMI|bmi|身高|斤|公斤|kg|分析.*身体|怎么减脂/])) {
    return { intent: AgentIntent.BODY_ANALYSIS, confidence: 0.84, reason: "body_analysis" };
  }

  return { intent: AgentIntent.UNSUPPORTED, confidence: 0.62, reason: "no_supported_intent" };
}

// ============================================================
// [方案A 新增] LLM intent fallback — 规则无把握时调 fast MiMo 分类
// ============================================================
const INTENT_ROUTER_SYSTEM = [
  "你是一个意图分类器。根据用户消息判断意图，只输出一个 JSON 对象，不要输出其他内容。",
  "可选意图：",
  "- DIET_RECORD        用户记录已吃过的食物/一餐",
  "- DIET_SUGGESTION    用户询问饮食建议/能吃多少/怎么吃",
  "- TRAINING_PLAN_CREATE 用户要求制定/安排训练计划",
  "- TRAINING_PLAN_UPDATE 用户要求修改/调整现有训练计划",
  "- TRAINING_RECORD    用户记录今天完成的训练动作",
  "- BODY_ANALYSIS      用户报告或询问体重/体脂/身高等身体数据",
  "- UNSUPPORTED        不在健身饮食范围内的请求（闲聊/写作/财经/天气等）",
  "",
  '输出格式：{"intent":"<意图>","confidence":0.0-1.0,"reason":"简短原因"}',
  "",
  "规则：",
  "- 已吃过的食物 -> DIET_RECORD；未来的饮食计划 -> DIET_SUGGESTION",
  '- "改成/换成" -> TRAINING_PLAN_UPDATE；"安排/制定" -> TRAINING_PLAN_CREATE',
  "- 涉及体重体脂身高 -> BODY_ANALYSIS",
  "- 跟健身饮食完全无关 -> UNSUPPORTED",
].join("\n");

const _VALID_LLM_INTENTS = new Set([
  "DIET_RECORD", "DIET_SUGGESTION",
  "TRAINING_PLAN_CREATE", "TRAINING_PLAN_UPDATE",
  "TRAINING_RECORD", "BODY_ANALYSIS", "UNSUPPORTED",
]);

/**
 * 从 LLM 返回文本解析意图 JSON (兼容 Markdown 包裹 + 多余文本).
 */
function _parseLlmIntentJson(raw) {
  let text = String(raw || "").trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "").trim();
  }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) text = m[0];
  let obj;
  try { obj = JSON.parse(text); } catch (e) { return { intent: AgentIntent.UNSUPPORTED, confidence: 0.3, reason: "llm_json_parse_failed" }; }
  const intentStr = String(obj.intent || "").toUpperCase().trim();
  if (!_VALID_LLM_INTENTS.has(intentStr)) {
    return { intent: AgentIntent.UNSUPPORTED, confidence: 0.3, reason: "llm_unknown_intent" };
  }
  let conf = Number(obj.confidence);
  if (!isFinite(conf)) conf = 0.7;
  conf = Math.max(0, Math.min(1, conf));
  return { intent: intentStr, confidence: conf, reason: "llm_router" };
}

/**
 * 异步意图识别: 规则优先, 无把握时调 LLM.
 *
 * @param {string} message - 用户消息
 * @param {object} opts - { hasImages, pendingWrite }
 * @param {function|null} llmCaller - async (systemPrompt, userPrompt) => string; 传 null 则不调 LLM
 * @returns {Promise<{intent,confidence,reason}>}
 */
async function recognizeIntentWithLLM(message, opts, llmCaller) {
  // 1. 规则优先 (与同步版完全一致)
  const ruleResult = recognizeIntent(message, opts);
  // 规则有把握 (confidence >= 0.8 或明确命中) -> 直接返回
  if (ruleResult.confidence >= 0.8 || ruleResult.reason !== "no_supported_intent") {
    return ruleResult;
  }

  // 2. 规则无把握 -> 调 LLM
  if (typeof llmCaller !== "function") {
    return ruleResult; // 无 LLM caller -> 保持规则结果
  }
  try {
    const hasImages = Boolean(opts && opts.hasImages);
    const flag = hasImages ? "[用户附带了图片] " : "";
    const userPrompt = `${flag}用户消息：${message || "(空)"}`;
    const raw = await llmCaller(INTENT_ROUTER_SYSTEM, userPrompt);
    return _parseLlmIntentJson(raw);
  } catch (err) {
    // LLM 失败 -> 降级回规则结果
    return ruleResult;
  }
}

module.exports = {
  hasAny,
  isCancel,
  isConfirmation,
  isWriteDenied,
  recognizeIntent,
  recognizeIntentWithLLM,
  detectBusinessIntent,
  BUSINESS_DOMAIN_SIGNALS,
  INTENT_ROUTER_SYSTEM,
  _parseLlmIntentJson
};
