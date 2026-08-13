const proposalPatch = require("./proposal_patch.js");

const QUICK_ACTION_INTENT_MAP = {
  "拍照记饮食": "food_log_write",
  "记录身体变化": "body_data_recognition",
  "生成今日饮食建议": "meal_plan_generation",
  "安排居家训练": "workout_plan_generation",
  "生成高蛋白饮食计划": "meal_plan_generation",
  "定制居家哑铃训练": "workout_plan_generation",
  "帮我评估今日热量差": "calorie_gap_evaluation",
  "识别饮食并记录": "food_log_write",
  "识别身体数据": "body_data_recognition"
};

const RESPONSE_MODES = {
  food_log_write: "generate_proposal",
  food_analysis_only: "analysis_only",
  meal_plan_generation: "answer_only",
  calorie_gap_evaluation: "analysis_only",
  workout_plan_generation: "generate_proposal",
  workout_log_record: "generate_proposal",
  workout_plan_query: "answer_only",
  workout_plan_update: "generate_proposal",
  workout_plan_delete: "generate_proposal",
  diet_record_query: "answer_only",
  diet_record_update: "generate_proposal",
  diet_record_delete: "generate_proposal",
  modify_pending_proposal: "patch_pending_proposal",
  body_data_recognition: "generate_proposal",
  body_data_query: "answer_only",
  body_data_update: "generate_proposal",
  body_data_delete: "generate_proposal",
  body_status_evaluation: "analysis_only",
  image_understanding: "generate_proposal",
  ambiguous: "ask_clarification",
  unsupported: "safe_redirect"
};

const HISTORY_REFERENCES = /(刚才|上面|这个|这条|这份|按刚才的|把刚才的)/;
const WRITE_INTENT = /(记录|写入|保存|同步|登记|录入|加入)/;
const QUERY_INTENT = /(查看|看看|查询|查下|展示|列出|回顾|读取|汇总|有哪些|还有什么)/;
const DELETE_INTENT = /(删除|删掉|去掉|移除|清空|不要)/;
const UPDATE_INTENT = /(改成|改为|换成|换为|调整为|修改|更正|更新)/;

const BODY_HINT = /(体重|体脂|bmi|基础代谢|内脏脂肪|腰围|臀围|胸围|大腿围|小腿围|上臂围|肩围|身高|身体数据|身体变化)/i;
const DIET_HINT = /(吃了|喝了|早餐|早饭|午餐|午饭|晚餐|晚饭|加餐|饮食|餐食|食物|热量|营养|蛋白质|碳水|脂肪)/;
const DIET_ADVICE_HINT = /(饮食建议|吃什么|饮食计划|高蛋白|减脂餐|增肌餐|根据.{0,12}(目标|记录).{0,12}(生成|给我).{0,8}(饮食建议|建议))/;
const WORKOUT_PLAN_HINT = /(训练计划|安排.{0,6}训练|居家.{0,6}训练|今天练什么|练腿|练胸|练背|练肩|练手臂|练核心|全身训练|哑铃训练)/;
const WORKOUT_LOG_HINT = /((今天做了|完成了|记录训练|训练记录).{0,24}(组|次|分钟))|((深蹲|卧推|硬拉|引体向上|俯卧撑|卷腹).{0,12}(组|次))/;
const CALORIE_GAP_HINT = /(热量差|热量缺口|今天.*还差|还可以吃多少|剩余.*热量)/;
const KNOWLEDGE_HINT = /(为什么|作用|原理|能不能|适不适合|是不是|怎么回事)/;

function shouldUsePreviousRecognition(intent, message) {
  return ["food_log_write", "food_analysis_only"].includes(intent) &&
    HISTORY_REFERENCES.test(String(message || ""));
}

function hasExplicitWriteIntent(message) {
  return WRITE_INTENT.test(String(message || ""));
}

function normalizeChineseNumber(value) {
  const digits = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9
  };
  return String(value || "")
    .split("")
    .reduce((number, char) => number * 10 + (digits[char] === undefined ? 0 : digits[char]), 0);
}

function parseHeight(text) {
  const source = String(text || "").replace(/\s+/g, "");
  let match = source.match(/(\d(?:\.\d{1,2})?)\s*(?:米|m)(?!m)/i);
  if (match) {
    const meters = Number(match[1]);
    if (meters >= 1 && meters <= 2.5) return Math.round(meters * 100);
  }
  match = source.match(/(?:身高(?:是|为)?)(\d{2,3})(?:cm|厘米|公分)/i);
  if (match) return Number(match[1]);
  match = source.match(/一米([零一二两三四五六七八九]{1,2})/);
  if (match) return 100 + normalizeChineseNumber(match[1]);
  match = source.match(/1米(\d{1,2})/);
  if (match) return 100 + Number(match[1]);
  return undefined;
}

function parseWeight(text) {
  const source = String(text || "").replace(/\s+/g, "");
  const match = source.match(/(\d{2,3}(?:\.\d+)?)\s*(公斤|千克|kg|斤|磅|lb|lbs)/i);
  if (!match) return {};
  const value = Number(match[1]);
  const unit = String(match[2] || "").toLowerCase();
  if (unit === "斤") {
    return { weightKg: Math.round(value * 0.5 * 10) / 10, originalWeightUnit: "jin" };
  }
  if (unit === "磅" || unit === "lb" || unit === "lbs") {
    return { weightKg: Math.round(value * 0.45359237 * 10) / 10, originalWeightUnit: "lb" };
  }
  return { weightKg: value, originalWeightUnit: "kg" };
}

function parseBodyStatusQuestion(message) {
  const text = String(message || "").trim();
  if (!text) return null;
  let heightCm = parseHeight(text);
  let weight = parseWeight(text);
  if (!heightCm || !weight.weightKg) {
    const compact = text.replace(/\s+/g, "");
    const pair = compact.match(/(?:身高)?(\d{2,3})[，,/ ](\d{2,3}(?:\.\d+)?)(斤|kg|公斤|千克|磅|lb|lbs)?/i);
    if (pair) {
      heightCm = heightCm || Number(pair[1]);
      weight = parseWeight(`${pair[2]}${pair[3] || "kg"}`);
    }
  }
  const hasBodyContext = /(身高|体重|公斤|千克|斤|磅|bmi|体型|身体状态|胖吗|瘦吗|超重|肥胖)/i.test(text);
  if (!heightCm && !weight.weightKg && !hasBodyContext) return null;
  return {
    heightCm,
    weightKg: weight.weightKg,
    originalWeightUnit: weight.originalWeightUnit,
    intent: "body_status_evaluation"
  };
}

function result(intent, confidence, reason, source, message, extra = {}) {
  return Object.assign({
    intent,
    confidence,
    reason,
    source,
    shouldUseHistory: shouldUsePreviousRecognition(intent, message),
    responseMode: RESPONSE_MODES[intent] || "safe_redirect",
    supported: !["unsupported", "out_of_scope"].includes(intent)
  }, extra);
}

function routeIntent(message, options = {}) {
  const text = String(message || "").trim();
  const quickAction = String(options.quickAction || "");
  const pendingProposal = options.pendingProposal || null;
  const explicitWrite = hasExplicitWriteIntent(text);

  if (quickAction && QUICK_ACTION_INTENT_MAP[quickAction]) {
    const intent = QUICK_ACTION_INTENT_MAP[quickAction];
    return result(intent, 1, "命中快捷入口", "quick_action", text, {
      category: intent,
      proposalType: intent === "food_log_write"
        ? "dietLog"
        : (intent === "body_data_recognition" ? "profilePatch" : "workoutPlan")
    });
  }

  if (!text && options.hasImages) {
    return result("image_understanding", 0.82, "图片输入等待模型分流", "rule", text, {
      category: "multimodal"
    });
  }

  if (!text && !options.hasImages) {
    return result("ambiguous", 0.45, "缺少明确任务", "rule", text);
  }

  if (pendingProposal && proposalPatch.looksLikeProposalPatch(text, pendingProposal)) {
    return result("modify_pending_proposal", 0.98, "命中待确认草稿修改语句", "rule", text, {
      category: "proposal_patch",
      proposalType: pendingProposal.type || "workoutPlan",
      pendingProposalId: pendingProposal.id || ""
    });
  }

  const bodyQuestion = parseBodyStatusQuestion(text);

  if ((DELETE_INTENT.test(text) || UPDATE_INTENT.test(text) || QUERY_INTENT.test(text)) && BODY_HINT.test(text)) {
    if (DELETE_INTENT.test(text)) {
      return result("body_data_delete", 0.95, "识别为身体数据删除", "rule", text, {
        category: "body_analysis",
        proposalType: "profilePatch"
      });
    }
    if (UPDATE_INTENT.test(text) || explicitWrite) {
      return result("body_data_update", 0.95, "识别为身体数据更新", "rule", text, {
        category: "body_analysis",
        proposalType: "profilePatch"
      });
    }
    return result("body_data_query", 0.93, "识别为身体数据查询", "rule", text, {
      category: "body_analysis"
    });
  }

  if ((DELETE_INTENT.test(text) || UPDATE_INTENT.test(text) || QUERY_INTENT.test(text)) && DIET_HINT.test(text)) {
    if (DELETE_INTENT.test(text)) {
      return result("diet_record_delete", 0.95, "识别为饮食记录删除", "rule", text, {
        category: "diet_log",
        proposalType: "dietLog"
      });
    }
    if (UPDATE_INTENT.test(text)) {
      return result("diet_record_update", 0.94, "识别为饮食记录修改", "rule", text, {
        category: "diet_log",
        proposalType: "dietLog"
      });
    }
    return result("diet_record_query", 0.92, "识别为饮食记录查询", "rule", text, {
      category: "diet_log"
    });
  }

  if ((DELETE_INTENT.test(text) || UPDATE_INTENT.test(text) || QUERY_INTENT.test(text)) && WORKOUT_PLAN_HINT.test(text)) {
    if (DELETE_INTENT.test(text)) {
      return result("workout_plan_delete", 0.95, "识别为训练计划删除", "rule", text, {
        category: "workout_plan_generate",
        proposalType: "workoutPlan"
      });
    }
    if (
      UPDATE_INTENT.test(text) ||
      /(每个项目|每个动作|每一项|每项).{0,6}\d+\s*组/.test(text)
    ) {
      return result("workout_plan_update", 0.95, "识别为训练计划修改", "rule", text, {
        category: "workout_plan_generate",
        proposalType: "workoutPlan"
      });
    }
    return result("workout_plan_query", 0.93, "识别为训练计划查询", "rule", text, {
      category: "workout_plan_generate"
    });
  }

  if (explicitWrite && (bodyQuestion || BODY_HINT.test(text))) {
    return result("body_data_recognition", bodyQuestion ? 0.99 : 0.94, "识别为身体数据写入", "rule", text, {
      category: "body_analysis",
      proposalType: "profilePatch",
      entities: bodyQuestion ? {
        height: bodyQuestion.heightCm,
        weight: bodyQuestion.weightKg,
        originalWeightUnit: bodyQuestion.originalWeightUnit
      } : {}
    });
  }

  if (bodyQuestion || /(分析|评估|看看).{0,6}(我的)?身体|bmi.{0,6}(正常|多少)|胖吗|瘦吗/.test(text)) {
    return result("body_status_evaluation", 0.97, "识别为身体分析", "rule", text, {
      category: "body_analysis",
      entities: bodyQuestion ? {
        height: bodyQuestion.heightCm,
        weight: bodyQuestion.weightKg,
        originalWeightUnit: bodyQuestion.originalWeightUnit
      } : {}
    });
  }

  if (/(不用|不要|无需|别).{0,5}(记录|写入|保存)/.test(text) && DIET_HINT.test(text)) {
    return result("food_analysis_only", 0.98, "只分析不记录", "rule", text, {
      category: "diet_advice"
    });
  }

  if (DIET_ADVICE_HINT.test(text)) {
    return result("meal_plan_generation", 0.96, "识别为饮食建议", "rule", text, {
      category: "diet_advice"
    });
  }

  if (explicitWrite && DIET_HINT.test(text)) {
    return result("food_log_write", 0.98, "识别为饮食记录", "rule", text, {
      category: "diet_log",
      proposalType: "dietLog"
    });
  }

  if (explicitWrite && HISTORY_REFERENCES.test(text) && /(饭|餐|吃|喝|这顿)/.test(text)) {
    return result("food_log_write", 0.94, "识别为补记上一条饮食", "rule", text, {
      category: "diet_log",
      proposalType: "dietLog"
    });
  }

  if (WORKOUT_LOG_HINT.test(text)) {
    return result("workout_log_record", 0.95, "识别为训练记录", "rule", text, {
      category: "workout_log_record",
      proposalType: "workoutPlan"
    });
  }

  if (WORKOUT_PLAN_HINT.test(text)) {
    return result("workout_plan_generation", 0.94, "识别为训练计划", "rule", text, {
      category: "workout_plan_generate",
      proposalType: "workoutPlan"
    });
  }

  if (CALORIE_GAP_HINT.test(text)) {
    return result("calorie_gap_evaluation", 0.96, "识别为热量分析", "rule", text, {
      category: "diet_advice"
    });
  }

  if (KNOWLEDGE_HINT.test(text)) {
    return result("unsupported", 0.9, "当前 Agent 不处理开放式知识问答", "rule", text, {
      category: "unsupported"
    });
  }

  if (options.hasImages && BODY_HINT.test(text)) {
    return result("body_data_recognition", 0.92, "图片输入并带有身体数据提示", "rule", text, {
      category: "body_analysis",
      proposalType: "profilePatch"
    });
  }

  if (options.hasImages && DIET_HINT.test(text)) {
    return result("food_log_write", 0.91, "图片输入并带有饮食提示", "rule", text, {
      category: "diet_log",
      proposalType: "dietLog"
    });
  }

  if (options.hasImages) {
    return result("image_understanding", 0.84, "图片输入等待模型识别领域", "rule", text, {
      category: "multimodal"
    });
  }

  return result("unsupported", 0.8, "超出当前支持范围", "rule", text, {
    category: "unsupported"
  });
}

module.exports = {
  QUICK_ACTION_INTENT_MAP,
  RESPONSE_MODES,
  hasExplicitWriteIntent,
  parseBodyStatusQuestion,
  routeIntent,
  shouldUsePreviousRecognition
};
