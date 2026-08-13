const nutritionHelper = require("../../../helper/nutrition_helper.js");
const userStorage = require("./user_storage.js");
const fitnessStore = require("../store/fitness_store.js");
const bodyMetricsService = require("./body_metrics_service.js");
const proposalPatch = require("./proposal_patch.js");

const DIET_KEY = "fitness_diet_records";
const TRAINING_KEY = "fitness_training_plan";

const MEAL_LABELS = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
  snack: "加餐"
};

const MEAL_KEYWORDS = [
  { key: "breakfast", pattern: /(早餐|早饭)/ },
  { key: "lunch", pattern: /(午餐|午饭)/ },
  { key: "dinner", pattern: /(晚餐|晚饭)/ },
  { key: "snack", pattern: /(加餐|夜宵)/ }
];

function clone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function dateWithOffset(offset) {
  const date = new Date();
  date.setDate(date.getDate() + Number(offset || 0));
  return fitnessStore.dateKey(date);
}

function resolveDate(text) {
  const source = String(text || "");
  const explicit = source.match(/(20\d{2}-\d{2}-\d{2})/);
  if (explicit) return explicit[1];
  if (/明天/.test(source)) return dateWithOffset(1);
  if (/昨天/.test(source)) return dateWithOffset(-1);
  return fitnessStore.dateKey();
}

function resolveMeal(text) {
  const source = String(text || "");
  const match = MEAL_KEYWORDS.find(item => item.pattern.test(source));
  return match ? match.key : "";
}

function resolveMealLabel(meal) {
  return MEAL_LABELS[meal] || "这餐";
}

function summarizeFoods(items) {
  return nutritionHelper.summarizeNutrition(Array.isArray(items) ? items : []);
}

function formatFoodItem(item) {
  const amount = item.amount !== undefined && item.amount !== null
    ? `${item.amount}${item.unit || ""}`
    : "--";
  return `${item.name} · ${amount} · ${item.calories || 0} kcal`;
}

function getDietRecords() {
  return userStorage.get(DIET_KEY, {});
}

function getTrainingRecords() {
  return userStorage.get(TRAINING_KEY, {});
}

function mealEntries(dateRecord) {
  return Object.keys(MEAL_LABELS)
    .map(key => ({ key, items: Array.isArray(dateRecord[key]) ? dateRecord[key] : [] }))
    .filter(item => item.items.length);
}

function searchFoodMeals(dateRecord, keyword) {
  const normalized = String(keyword || "").trim();
  if (!normalized) return [];
  return mealEntries(dateRecord).filter(meal => (
    meal.items.some(item => String(item.name || "").includes(normalized))
  ));
}

function resolveDietMeal(text, dateRecord, keyword) {
  const explicitMeal = resolveMeal(text);
  if (explicitMeal) return explicitMeal;
  const searchedMeals = searchFoodMeals(dateRecord, keyword);
  if (searchedMeals.length === 1) return searchedMeals[0].key;
  const availableMeals = mealEntries(dateRecord);
  return availableMeals.length === 1 ? availableMeals[0].key : "";
}

function extractBeforeAction(text, actionPattern) {
  const match = String(text || "").match(actionPattern);
  return match ? String(match[1] || "").trim() : "";
}

function cleanEntityKeyword(raw) {
  return String(raw || "")
    .replace(/^(把|将|把刚才|今天|今日|昨天|明天|刚才|这条|这一条|这份|当前|最近一次)/, "")
    .replace(/^(早餐|早饭|午餐|午饭|晚餐|晚饭|加餐)(的)?/, "")
    .replace(/^(饮食记录|饮食|餐食|记录)(里的|中的|的)?/, "")
    .replace(/^(里的|中的|的)/, "")
    .replace(/(早餐|早饭|午餐|午饭|晚餐|晚饭|加餐|饮食记录|饮食|餐食|记录|里的|中的|这餐|这一餐)$/g, "")
    .trim();
}

function extractFoodKeyword(text) {
  const source = String(text || "");
  const updateKeyword = cleanEntityKeyword(extractBeforeAction(
    source,
    /(?:把|将)?(.{0,20}?)(?:改成|改为|换成|换为|调整为|修改为|更新为)/
  ));
  if (updateKeyword) return updateKeyword;
  const deleteKeyword = cleanEntityKeyword(extractBeforeAction(
    source,
    /(?:删除|删掉|去掉|移除)(.{0,20})/
  ));
  return deleteKeyword;
}

function findFoodIndex(items, keyword) {
  const normalized = String(keyword || "").trim();
  if (!normalized) return items.length === 1 ? 0 : -1;
  return items.findIndex(item => String(item.name || "").includes(normalized));
}

function parseFoodReplacement(text, currentItem) {
  const source = String(text || "");
  const next = Object.assign({}, currentItem);
  const amountMatch = source.match(/(?:改成|改为|换成|换为|调整为|修改为|更新为)\s*(\d+(?:\.\d+)?)\s*(g|克|份|个|ml|毫升)/i);
  if (amountMatch) {
    const amount = Number(amountMatch[1]);
    const ratio = Math.max(0, amount) / Math.max(0.01, Number(currentItem.amount) || 1);
    next.amount = amount;
    next.unit = /克/i.test(amountMatch[2]) ? "g" : amountMatch[2];
    next.calories = Math.round((Number(currentItem.calories) || 0) * ratio);
    next.carbs = Math.round((Number(currentItem.carbs) || 0) * ratio * 10) / 10;
    next.protein = Math.round((Number(currentItem.protein) || 0) * ratio * 10) / 10;
    next.fat = Math.round((Number(currentItem.fat) || 0) * ratio * 10) / 10;
    return next;
  }
  const calorieMatch = source.match(/(?:改成|改为|换成|换为|调整为|修改为|更新为)\s*(\d+(?:\.\d+)?)\s*kcal/i);
  if (calorieMatch) {
    const calories = Math.max(0, Number(calorieMatch[1]) || 0);
    const protein = Math.max(0, Number(currentItem.protein) || 0);
    const fat = Math.max(0, Number(currentItem.fat) || 0);
    const carbs = Math.max(0, Math.round(((calories - protein * 4 - fat * 9) / 4) * 10) / 10);
    next.calories = nutritionHelper.calculateCaloriesByMacros(carbs, protein, fat);
    next.carbs = carbs;
    return next;
  }
  const renameMatch = source.match(/(?:改成|改为|换成|换为|调整为|修改为|更新为)\s*([^\s，。]+)/);
  const nextName = String(renameMatch && renameMatch[1] || "").trim();
  if (nextName && !/\d/.test(nextName)) {
    next.name = nextName;
  }
  return next;
}

function buildDietQueryReply(message) {
  const date = resolveDate(message);
  const records = getDietRecords();
  const dateRecord = records[date] || {};
  const explicitMeal = resolveMeal(message);
  if (explicitMeal) {
    const items = Array.isArray(dateRecord[explicitMeal]) ? dateRecord[explicitMeal] : [];
    if (!items.length) {
      return `我没有找到 ${date} 的${resolveMealLabel(explicitMeal)}记录。`;
    }
    const totals = summarizeFoods(items);
    return [
      `${date} 的${resolveMealLabel(explicitMeal)}共记录 ${items.length} 项，约 ${totals.calories} kcal。`,
      ...items.map(formatFoodItem)
    ].join("\n");
  }
  const meals = mealEntries(dateRecord);
  if (!meals.length) {
    return `我没有找到 ${date} 的饮食记录。`;
  }
  const allFoods = meals.reduce((list, meal) => list.concat(meal.items), []);
  const totals = summarizeFoods(allFoods);
  return [
    `${date} 共记录 ${allFoods.length} 项饮食，约 ${totals.calories} kcal。`,
    ...meals.map(meal => {
      const mealSummary = summarizeFoods(meal.items);
      return `${resolveMealLabel(meal.key)}：${meal.items.length} 项，${mealSummary.calories} kcal`;
    })
  ].join("\n");
}

function buildDietMutationProposal(message, intentResult, context) {
  const date = resolveDate(message);
  const records = getDietRecords();
  const dateRecord = records[date] || {};
  const foodKeyword = extractFoodKeyword(message);
  const meal = resolveDietMeal(message, dateRecord, foodKeyword);
  if (!meal) {
    return {
      mode: "reply",
      content: "请告诉我要操作哪一餐，例如“删除今天午餐的米饭”或“查看今天早餐记录”。",
      assistantType: "diet"
    };
  }
  const currentItems = clone(dateRecord[meal] || []);
  if (!currentItems.length) {
    return {
      mode: "reply",
      content: `我没有找到 ${date} 的${resolveMealLabel(meal)}记录。`,
      assistantType: "diet"
    };
  }
  const targetIndex = findFoodIndex(currentItems, foodKeyword);
  if (intentResult.intent === "diet_record_update") {
    if (targetIndex < 0) {
      return {
        mode: "reply",
        content: `我没定位到 ${resolveMealLabel(meal)}里要修改的食物，请说得再具体一点。`,
        assistantType: "diet"
      };
    }
    const currentItem = currentItems[targetIndex];
    const nextItems = currentItems.slice();
    nextItems[targetIndex] = parseFoodReplacement(message, currentItem);
    return {
      mode: "proposal",
      assistantType: "diet",
      content: `我先把 ${date} 的${resolveMealLabel(meal)}整理成一张待确认修改卡片，确认后我再写回记录。`,
      proposal: {
        id: `diet-update-${Date.now()}`,
        type: "dietLog",
        status: "pending",
        summary: `更新${resolveMealLabel(meal)}中的“${currentItem.name}”`,
        payload: {
          operation: "update",
          replaceMeal: true,
          date,
          meal,
          items: nextItems,
          sourceMessageId: context.sourceMessageId
        }
      }
    };
  }

  const deletingWholeMeal = targetIndex < 0 || /(记录|这餐|这一餐|整餐|全部)/.test(message);
  const nextItems = deletingWholeMeal
    ? []
    : currentItems.filter((item, index) => index !== targetIndex);
  const summary = deletingWholeMeal
    ? `删除 ${date} 的${resolveMealLabel(meal)}记录`
    : `删除${resolveMealLabel(meal)}中的“${currentItems[targetIndex].name}”`;
  return {
    mode: "proposal",
    assistantType: "diet",
    content: `我先整理出一张待确认删除卡片，确认后我再更新 ${resolveMealLabel(meal)}记录。`,
    proposal: {
      id: `diet-delete-${Date.now()}`,
      type: "dietLog",
      status: "pending",
      summary,
      payload: {
        operation: "delete",
        replaceMeal: true,
        date,
        meal,
        items: nextItems,
        sourceMessageId: context.sourceMessageId
      }
    }
  };
}

function buildWorkoutQueryReply(message) {
  const date = resolveDate(message);
  const plan = clone(getTrainingRecords()[date] || []);
  if (!plan.length) {
    return `我没有找到 ${date} 的训练计划。`;
  }
  const totalSets = plan.reduce((sum, item) => sum + (Array.isArray(item.sets) ? item.sets.length : 0), 0);
  return [
    `${date} 有 ${plan.length} 个训练动作，共 ${totalSets} 组。`,
    ...plan.map(item => `${item.name} · ${(item.sets || []).length} 组`)
  ].join("\n");
}

function buildWorkoutBaseProposal(date, exercises, extra = {}) {
  return {
    id: `workout-crud-${Date.now()}`,
    type: "workoutPlan",
    status: "pending",
    summary: extra.summary || `更新 ${date} 训练计划`,
    payload: Object.assign({
      operation: "update",
      date,
      writeMode: "replace",
      planName: `${date} 训练计划`,
      exercises: clone(exercises)
    }, extra.payload || {})
  };
}

function buildWorkoutMutationProposal(message, intentResult, context) {
  const date = resolveDate(message);
  const currentPlan = clone(getTrainingRecords()[date] || []);
  if (!currentPlan.length) {
    return {
      mode: "reply",
      content: `我没有找到 ${date} 的训练计划。`,
      assistantType: "training"
    };
  }

  if (intentResult.intent === "workout_plan_delete" && /(训练计划|今天训练|这份训练|全部训练)/.test(message) && !/不要|去掉|删掉.+动作/.test(message)) {
    return {
      mode: "proposal",
      assistantType: "training",
      content: `我先整理出 ${date} 的整份训练计划删除卡片，确认后再执行。`,
      proposal: buildWorkoutBaseProposal(date, currentPlan, {
        summary: `删除 ${date} 的训练计划`,
        payload: {
          operation: "delete",
          writeMode: "delete"
        }
      })
    };
  }

  const baseProposal = buildWorkoutBaseProposal(date, currentPlan);
  const patchResult = proposalPatch.applyPendingProposalPatch(
    baseProposal,
    message,
    {
      userProfile: context.userProfile,
      tomorrowKey: dateWithOffset(1)
    }
  );

  if (!patchResult.applied) {
    return {
      mode: "reply",
      content: "请更具体地描述训练计划要怎么改，例如“把刚才训练计划改成练腿”“每个项目 6 组”或“删掉波比跳”。",
      assistantType: "training"
    };
  }

  const proposal = patchResult.proposal;
  proposal.payload = Object.assign({}, proposal.payload, {
    operation: intentResult.intent === "workout_plan_delete" ? "update" : "update",
    writeMode: proposal.payload.writeMode || "replace",
    date: proposal.payload.date || date
  });

  if (!Array.isArray(proposal.payload.exercises) || !proposal.payload.exercises.length) {
    proposal.payload.operation = "delete";
    proposal.payload.writeMode = "delete";
    proposal.summary = `删除 ${date} 的训练计划`;
  }

  return {
    mode: "proposal",
    assistantType: "training",
    content: "我先把现有训练计划整理成待确认版本，确认后我再写回。",
    proposal
  };
}

function flexibleBodyPatch(text) {
  const parsed = bodyMetricsService.parseBodyMetricsText(text);
  const source = String(text || "");
  const fallbacks = [
    { key: "weight", pattern: /体重.{0,8}?(\d+(?:\.\d+)?)/ },
    { key: "bodyFatRate", pattern: /体脂.{0,8}?(\d+(?:\.\d+)?)/ },
    { key: "height", pattern: /身高.{0,8}?(\d+(?:\.\d+)?)/ },
    { key: "bmi", pattern: /bmi.{0,8}?(\d+(?:\.\d+)?)/i },
    { key: "deviceBmr", pattern: /基础代谢.{0,8}?(\d+(?:\.\d+)?)/ },
    { key: "waist", pattern: /腰围.{0,8}?(\d+(?:\.\d+)?)/ }
  ];
  fallbacks.forEach(item => {
    if (parsed[item.key] !== undefined) return;
    const match = source.match(item.pattern);
    if (match) parsed[item.key] = Number(match[1]);
  });
  return bodyMetricsService.normalizeMetrics(parsed);
}

function bodyFieldKeywords() {
  const map = {};
  bodyMetricsService.FIELD_DEFINITIONS.forEach(field => {
    map[field.key] = (bodyMetricsService.BODY_FIELD_ALIASES[field.key] || [field.key]).concat(field.label);
  });
  return map;
}

function extractBodyFields(text) {
  const source = String(text || "").toLowerCase();
  const definitions = bodyFieldKeywords();
  const matched = Object.keys(definitions).filter(key => (
    definitions[key].some(alias => source.includes(String(alias).toLowerCase()))
  ));
  if (/体脂/.test(source) && !matched.includes("bodyFatRate")) matched.push("bodyFatRate");
  if (/体重/.test(source) && !matched.includes("weight")) matched.push("weight");
  if (/基础代谢|代谢/.test(source) && !matched.includes("deviceBmr")) matched.push("deviceBmr");
  return matched;
}

function formatBodyMetrics(metrics) {
  return bodyMetricsService.FIELD_DEFINITIONS
    .filter(field => metrics[field.key] !== undefined)
    .slice(0, 8)
    .map(field => `${field.label}：${metrics[field.key]}${field.unit || ""}`);
}

function resolveBodyRecord(message) {
  const date = resolveDate(message);
  const records = bodyMetricsService.getRecords();
  const byDate = records.filter(item => item.date === date);
  if (byDate.length) return byDate[byDate.length - 1];
  return bodyMetricsService.getLatestRecord();
}

function buildBodyQueryReply(message) {
  const record = resolveBodyRecord(message);
  if (!record || !record.metrics) {
    return "我还没有找到身体数据记录。";
  }
  const title = record.recordedAt
    ? `${record.date} 的最近一次身体数据如下：`
    : "当前可用的身体数据如下：";
  return [title].concat(formatBodyMetrics(record.metrics)).join("\n");
}

function buildBodyMutationProposal(message, intentResult, context) {
  const record = resolveBodyRecord(message);
  if (!record || !record.metrics) {
    return {
      mode: "reply",
      content: "我还没有找到可供修改的身体数据记录。",
      assistantType: "profile"
    };
  }

  if (intentResult.intent === "body_data_update") {
    const patch = flexibleBodyPatch(message);
    if (!Object.keys(patch).length) {
      return {
        mode: "reply",
        content: "请直接告诉我要改成的身体数据，例如“把体重改成 82.2kg”或“把体脂改成 22%”。",
        assistantType: "profile"
      };
    }
    return {
      mode: "proposal",
      assistantType: "profile",
      content: `我先把 ${record.date} 的身体数据整理成待确认修改卡片，确认后再写入。`,
      proposal: {
        id: `body-update-${Date.now()}`,
        type: "profilePatch",
        status: "pending",
        summary: `更新 ${record.date} 的身体数据`,
        payload: {
          operation: "update",
          recordId: record.id,
          date: record.date,
          profilePatch: patch,
          sourceMessageId: context.sourceMessageId
        }
      }
    };
  }

  const fields = extractBodyFields(message);
  if (fields.length) {
    const previewPatch = {};
    fields.forEach(key => {
      if (record.metrics[key] !== undefined) previewPatch[key] = record.metrics[key];
    });
    return {
      mode: "proposal",
      assistantType: "profile",
      content: `我先整理出 ${record.date} 身体数据中的待删除字段，确认后再执行。`,
      proposal: {
        id: `body-delete-fields-${Date.now()}`,
        type: "profilePatch",
        status: "pending",
        summary: `删除 ${record.date} 的部分身体数据字段`,
        payload: {
          operation: "delete_fields",
          recordId: record.id,
          date: record.date,
          fields,
          profilePatch: previewPatch,
          sourceMessageId: context.sourceMessageId
        }
      }
    };
  }

  return {
    mode: "proposal",
    assistantType: "profile",
    content: `我先整理出 ${record.date} 的整条身体数据删除卡片，确认后再执行。`,
    proposal: {
      id: `body-delete-${Date.now()}`,
      type: "profilePatch",
      status: "pending",
      summary: `删除 ${record.date} 的身体数据记录`,
      payload: {
        operation: "delete",
        recordId: record.id,
        date: record.date,
        profilePatch: clone(record.metrics),
        sourceMessageId: context.sourceMessageId
      }
    }
  };
}

function handleLocalIntent(message, intentResult, context = {}) {
  const intent = String(intentResult && intentResult.intent || "");
  if (intent === "diet_record_query") {
    return { handled: true, mode: "reply", assistantType: "diet", content: buildDietQueryReply(message) };
  }
  if (intent === "diet_record_update" || intent === "diet_record_delete") {
    return Object.assign({ handled: true }, buildDietMutationProposal(message, intentResult, context));
  }
  if (intent === "workout_plan_query") {
    return { handled: true, mode: "reply", assistantType: "training", content: buildWorkoutQueryReply(message) };
  }
  if (intent === "workout_plan_update" || intent === "workout_plan_delete") {
    return Object.assign({ handled: true }, buildWorkoutMutationProposal(message, intentResult, context));
  }
  if (intent === "body_data_query") {
    return { handled: true, mode: "reply", assistantType: "profile", content: buildBodyQueryReply(message) };
  }
  if (intent === "body_data_update" || intent === "body_data_delete") {
    return Object.assign({ handled: true }, buildBodyMutationProposal(message, intentResult, context));
  }
  return { handled: false };
}

module.exports = {
  handleLocalIntent,
  resolveDate
};
