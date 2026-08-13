const { AgentIntent } = require("../../shared/types/agent_types.js");
const { addDaysKey, todayKey } = require("../../shared/utils/date.js");

const CN_NUM = Object.freeze({
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
  九: 9,
  十: 10
});

function parseChineseNumber(value) {
  const text = String(value || "").trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
  if (text === "十") return 10;
  if (/^十[一二三四五六七八九]$/.test(text)) return 10 + CN_NUM[text[1]];
  if (/^[一二两三四五六七八九]十$/.test(text)) return CN_NUM[text[0]] * 10;
  if (/^[一二两三四五六七八九]十[一二三四五六七八九]$/.test(text)) {
    return CN_NUM[text[0]] * 10 + CN_NUM[text[2]];
  }
  return CN_NUM[text] !== undefined ? CN_NUM[text] : NaN;
}

function numberPattern() {
  return "(\\d+(?:\\.\\d+)?|[一二两三四五六七八九十]{1,3})";
}

function firstNumber(text, regex) {
  const match = String(text || "").match(regex);
  if (!match) return undefined;
  const value = parseChineseNumber(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function extractDate(text, now) {
  if (/明天/.test(text)) return addDaysKey(1, now);
  if (/后天/.test(text)) return addDaysKey(2, now);
  return todayKey(now);
}

function inferMeal(text) {
  if (/早餐|早饭|早上/.test(text)) return "breakfast";
  if (/午餐|午饭|中午/.test(text)) return "lunch";
  if (/晚餐|晚饭|晚上/.test(text)) return "dinner";
  if (/加餐|夜宵|刚才|奶茶|喝了/.test(text)) return "snack";
  return "";
}

function extractDietItems(text) {
  const known = ["牛肉面", "奶茶", "米饭", "鸡胸肉", "鸡胸", "青菜", "鸡蛋", "酸奶", "苹果", "香蕉"];
  const items = known
    .filter(name => text.includes(name))
    .map(name => ({
      name: name === "鸡胸" ? "鸡胸肉" : name,
      amount: 1,
      unit: name === "奶茶" ? "杯" : (name.includes("面") ? "碗" : "份"),
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      confidence: 0.65
    }));
  if (items.length) return items;
  const cleaned = text
    .replace(/^(早餐|午餐|晚餐|早饭|午饭|晚饭)?(吃了|有|喝了|刚才|帮我|记录|记一下|一下|，|,|\s)+/g, "")
    .replace(/(帮我)?(记录|记一下|一下)$/g, "")
    .trim();
  if (!cleaned) return [];
  return cleaned
    .split(/[、，,和]/)
    .map(name => name.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map(name => ({
      name,
      amount: 1,
      unit: "份",
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      confidence: 0.45
    }));
}

function extractExerciseName(text) {
  const names = ["卧推", "深蹲", "硬拉", "跑步", "跑了", "跳绳", "游泳", "骑行", "椭圆机", "划船", "推举", "俯卧撑", "引体向上", "卷腹", "平板支撑", "有氧", "箭步蹲", "臀桥"];
  const matched = names.find(name => text.includes(name));
  if (matched === "跑了") return "跑步";
  return matched || "训练";
}

function parseTrainingRecord(text) {
  const sets = firstNumber(text, new RegExp(`${numberPattern()}\\s*组`));
  const reps = firstNumber(text, new RegExp(`每组\\s*${numberPattern()}\\s*(次|个)`)) ||
    firstNumber(text, new RegExp(`${numberPattern()}\\s*(次|个)`));
  const durationMin = firstNumber(text, new RegExp(`${numberPattern()}\\s*分钟`));
  const distanceKm = firstNumber(text, new RegExp(`${numberPattern()}\\s*(公里|千米|km)`));
  const weightKg = firstNumber(text, new RegExp(`${numberPattern()}\\s*(公斤|千克|kg)`));
  const item = { exerciseName: extractExerciseName(text) };
  if (sets !== undefined) item.sets = sets;
  if (reps !== undefined) item.reps = reps;
  if (durationMin !== undefined) item.durationMin = durationMin;
  if (distanceKm !== undefined) item.distanceKm = distanceKm;
  if (weightKg !== undefined) item.weightKg = weightKg;
  return { items: [item] };
}

function parseTrainingPlan(text) {
  const goal = /增肌/.test(text) ? "增肌" : (/减脂/.test(text) ? "减脂" : "");
  const daysPerWeek = firstNumber(text, new RegExp(`每周\\s*(?:练|训练)?\\s*${numberPattern()}\\s*天`));
  const equipment = [];
  if (/哑铃/.test(text)) equipment.push("哑铃");
  if (/瑜伽垫/.test(text)) equipment.push("瑜伽垫");
  if (/杠铃/.test(text)) equipment.push("杠铃");
  if (/徒手|居家/.test(text)) equipment.push("徒手");
  return {
    goal,
    daysPerWeek,
    equipment,
    planName: goal ? `${goal}训练计划` : "训练计划",
    exercises: buildDefaultExercises(goal, equipment)
  };
}

function buildDefaultExercises(goal, equipment) {
  const hasDumbbell = (equipment || []).includes("哑铃");
  if (hasDumbbell) {
    return [
      { name: "哑铃深蹲", sets: [{ reps: "12", restSeconds: 60 }] },
      { name: "哑铃划船", sets: [{ reps: "12", restSeconds: 60 }] },
      { name: "哑铃推举", sets: [{ reps: "10", restSeconds: 75 }] },
      { name: "平板支撑", sets: [{ reps: "45秒", restSeconds: 45 }] }
    ];
  }
  if (goal === "增肌") {
    return [
      { name: "深蹲", sets: [{ reps: "8-10", restSeconds: 90 }] },
      { name: "卧推", sets: [{ reps: "8-10", restSeconds: 90 }] },
      { name: "划船", sets: [{ reps: "10-12", restSeconds: 75 }] }
    ];
  }
  return [
    { name: "快走或慢跑", sets: [{ reps: "30分钟", restSeconds: 0 }] },
    { name: "深蹲", sets: [{ reps: "12", restSeconds: 60 }] },
    { name: "俯卧撑", sets: [{ reps: "10", restSeconds: 60 }] },
    { name: "平板支撑", sets: [{ reps: "45秒", restSeconds: 45 }] }
  ];
}

function parsePlanUpdate(text) {
  const targetDay = /明天/.test(text)
    ? "tomorrow"
    : (/今天/.test(text) ? "today" : ((text.match(/周[一二三四五六日天]/) || [])[0] || ""));
  const operation = /减半/.test(text) ? "reduce_volume" : "replace";
  const replacement = (text.match(/改成([^，,。]+)/) || text.match(/换成([^，,。]+)/) || [])[1] || "";
  return {
    targetDay,
    operation,
    replacement,
    patch: {
      targetDay,
      operation,
      replacement,
      rawText: text
    },
    exercises: replacement ? [{ name: replacement, sets: [{ reps: "按计划执行", restSeconds: 60 }] }] : []
  };
}

function parseBodyMetrics(text) {
  const heightCm = firstNumber(text, /(?:我\s*)?(\d{2,3})(?:\s*cm|厘米|公分)?(?:[，,\s]|$)/);
  const jin = firstNumber(text, new RegExp(`${numberPattern()}\\s*斤`));
  const kg = firstNumber(text, new RegExp(`${numberPattern()}\\s*(?:公斤|千克|kg)`));
  const bodyFatRate = firstNumber(text, new RegExp(`体脂\\s*${numberPattern()}\\s*%?`));
  const metrics = {};
  const slots = {};
  if (heightCm && heightCm >= 80 && heightCm <= 230) {
    metrics.heightCm = heightCm;
    slots.heightCm = heightCm;
  }
  if (jin) {
    slots.weightJin = jin;
    slots.weightKg = Math.round(jin * 0.5 * 10) / 10;
    metrics.weightKg = slots.weightKg;
  } else if (kg) {
    slots.weightKg = kg;
    metrics.weightKg = kg;
  }
  if (bodyFatRate !== undefined) {
    slots.bodyFatRate = bodyFatRate;
    metrics.bodyFatRate = bodyFatRate;
  }
  return { metrics, slots };
}

function parseSlots(intent, message, options) {
  const text = String(message || "").trim();
  const now = options && options.now instanceof Date ? options.now : new Date();
  const date = extractDate(text, now);
  const writeDenied = /(不用|不要|无需|先别).{0,8}(记录|保存|写入|记上)|只.{0,8}(分析|看看|建议|评估)|不.{0,4}(保存|写入|记录)/.test(text);
  if (intent === AgentIntent.DIET_RECORD) {
    return {
      date,
      meal: inferMeal(text),
      items: extractDietItems(text),
      hasImages: Boolean(options && options.hasImages),
      writeDenied
    };
  }
  if (intent === AgentIntent.TRAINING_RECORD) {
    return Object.assign({ date, writeDenied }, parseTrainingRecord(text));
  }
  if (intent === AgentIntent.TRAINING_PLAN_CREATE) {
    return Object.assign({ date, writeDenied }, parseTrainingPlan(text));
  }
  if (intent === AgentIntent.TRAINING_PLAN_UPDATE) {
    return Object.assign({ date, writeDenied }, parsePlanUpdate(text));
  }
  if (intent === AgentIntent.BODY_ANALYSIS) {
    const parsed = parseBodyMetrics(text);
    return Object.assign({ date, hasImages: Boolean(options && options.hasImages), writeDenied }, parsed.slots, {
      metrics: parsed.metrics
    });
  }
  if (intent === AgentIntent.DIET_SUGGESTION) {
    return { date, topic: text, hasImages: Boolean(options && options.hasImages), writeDenied };
  }
  return {};
}

module.exports = {
  buildDefaultExercises,
  extractDietItems,
  firstNumber,
  parseBodyMetrics,
  parseChineseNumber,
  parseSlots,
  parseTrainingRecord
};
