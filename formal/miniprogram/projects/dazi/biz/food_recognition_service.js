const nutritionHelper = require("../../../helper/nutrition_helper.js");

const ACTIVE_RECOGNITION_KEY = "fitness_active_food_recognition";

const FOOD_CATALOG = [
  {
    name: "多层皇堡",
    aliases: ["汉堡王多层皇堡", "多层皇堡", "皇堡"],
    amount: 1,
    unit: "份",
    carbs: 75,
    protein: 45,
    fat: 70,
    category: "汉堡"
  },
  {
    name: "汉堡",
    aliases: ["汉堡包", "汉堡"],
    amount: 1,
    unit: "份",
    carbs: 48,
    protein: 25,
    fat: 28,
    category: "汉堡"
  },
  {
    name: "中杯可乐",
    aliases: ["中杯可乐", "可乐"],
    amount: 1,
    unit: "杯",
    carbs: 62.5,
    protein: 0,
    fat: 0,
    category: "含糖饮料"
  },
  {
    name: "薯条",
    aliases: ["炸薯条", "薯条"],
    amount: 1,
    unit: "份",
    carbs: 48,
    protein: 5,
    fat: 17,
    category: "油炸食品"
  },
  {
    name: "白米饭",
    aliases: ["白米饭", "米饭"],
    amount: 150,
    unit: "g",
    carbs: 38.9,
    protein: 3.9,
    fat: 0.5,
    category: "主食"
  },
  {
    name: "鸡胸肉",
    aliases: ["鸡胸肉"],
    amount: 120,
    unit: "g",
    carbs: 0,
    protein: 37.2,
    fat: 4.3,
    category: "高蛋白肉类"
  },
  {
    name: "烧鸭",
    aliases: ["烤鸭", "烧鸭"],
    amount: 150,
    unit: "g",
    carbs: 4.5,
    protein: 28.5,
    fat: 42,
    category: "肉类"
  },
  {
    name: "叉烧",
    aliases: ["叉烧"],
    amount: 100,
    unit: "g",
    carbs: 10,
    protein: 23,
    fat: 18,
    category: "肉类"
  },
  {
    name: "豆角",
    aliases: ["豆角"],
    amount: 100,
    unit: "g",
    carbs: 7,
    protein: 2.5,
    fat: 0.3,
    category: "蔬菜"
  },
  {
    name: "青菜",
    aliases: ["青菜", "绿叶菜"],
    amount: 100,
    unit: "g",
    carbs: 3.5,
    protein: 1.8,
    fat: 0.3,
    category: "蔬菜"
  }
];

function uniqueId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function round(value) {
  return Math.round((Math.max(0, Number(value) || 0)) * 10) / 10;
}

function detectMealType(text) {
  const value = String(text || "");
  if (/早餐|早饭/.test(value)) return "breakfast";
  if (/午餐|午饭/.test(value)) return "lunch";
  if (/晚餐|晚饭/.test(value)) return "dinner";
  if (/加餐|夜宵/.test(value)) return "snack";
  return "";
}

function createFoodItem(source, index, metadata) {
  const item = source || {};
  const carbs = round(item.carbs);
  const protein = round(item.protein);
  const fat = round(item.fat);
  const confidence = Math.max(0, Math.min(1, Number(item.confidence) || 0));
  return {
    id: String(item.id || `${metadata.recognitionId}-food-${index + 1}`),
    name: String(item.name || item.displayName || "待确认食物"),
    displayName: String(item.displayName || item.name || "待确认食物"),
    estimatedAmount: round(item.estimatedAmount === undefined ? item.amount : item.estimatedAmount) || 1,
    amount: round(item.amount === undefined ? item.estimatedAmount : item.amount) || 1,
    unit: String(item.unit || "份"),
    calories: nutritionHelper.calculateCaloriesByMacros(carbs, protein, fat),
    carbs,
    protein,
    fat,
    confidence,
    source: metadata.source,
    matchedFoodId: item.matchedFoodId || "",
    matchConfidence: item.matchConfidence === undefined ? null : Number(item.matchConfidence),
    isEstimatedFood: item.isEstimatedFood !== false
  };
}

function extractKnownFoods(text, metadata) {
  const source = String(text || "");
  const matches = [];
  FOOD_CATALOG.forEach(food => {
    const alias = food.aliases
      .slice()
      .sort((left, right) => right.length - left.length)
      .find(value => value.length >= 2 && source.includes(value));
    if (!alias) return;
    matches.push({ food, alias, position: source.indexOf(alias) });
  });
  matches.sort((left, right) => left.position - right.position || right.alias.length - left.alias.length);
  const seen = new Set();
  return matches.reduce((items, match) => {
    if (seen.has(match.food.name)) return items;
    if (
      match.food.name === "汉堡" &&
      items.some(item => item.name === "多层皇堡")
    ) return items;
    if (
      match.food.name === "可乐" &&
      items.some(item => item.name === "中杯可乐")
    ) return items;
    seen.add(match.food.name);
    items.push(createFoodItem(Object.assign({}, match.food, {
      confidence: metadata.source === "image" ? 0.86 : 0.9,
      matchedFoodId: match.food.name,
      matchConfidence: 1,
      isEstimatedFood: true
    }), items.length, metadata));
    return items;
  }, []);
}

function normalizeProposalItems(items, metadata) {
  return (Array.isArray(items) ? items : [])
    .filter(item => item && String(item.name || item.displayName || "").trim())
    .map((item, index) => createFoodItem(Object.assign({}, item, {
      confidence: item.confidence === undefined ? 0.72 : item.confidence,
      isEstimatedFood: item.isEstimatedFood !== false
    }), index, metadata));
}

function buildStructuredResult(options) {
  const input = options || {};
  const recognitionId = String(input.recognitionId || uniqueId("recognition"));
  const sourceMessageId = String(input.sourceMessageId || "");
  const metadata = {
    recognitionId,
    source: input.source === "image" ? "image" : (input.source || "text")
  };
  const foods = normalizeProposalItems(input.foods, metadata);
  const totals = nutritionHelper.summarizeNutrition(foods);
  const confidence = foods.length
    ? round(foods.reduce((sum, item) => sum + item.confidence, 0) / foods.length)
    : 0;
  return {
    id: recognitionId,
    sourceMessageId,
    sourceImageId: input.sourceImageId || "",
    sourceImageIds: Array.isArray(input.sourceImageIds) ? input.sourceImageIds.slice() : [],
    recognizedAt: new Date().toISOString(),
    foods,
    totalCalories: totals.calories,
    totalCarbs: totals.carbs,
    totalProtein: totals.protein,
    totalFat: totals.fat,
    confidence,
    explanation: String(input.explanation || "")
  };
}

function beginRecognition(sourceMessageId, sourceImageIds) {
  const recognition = {
    id: uniqueId("recognition"),
    draftId: uniqueId("food-draft"),
    sourceMessageId: String(sourceMessageId || ""),
    sourceImageIds: Array.isArray(sourceImageIds) ? sourceImageIds.slice() : [],
    startedAt: new Date().toISOString()
  };
  if (typeof wx !== "undefined") {
    require("./ai_write_service.js").cancelPendingFoodDraftsExcept(recognition.sourceMessageId);
    wx.setStorageSync(ACTIVE_RECOGNITION_KEY, recognition);
  }
  return recognition;
}

function getActiveRecognition() {
  return typeof wx === "undefined"
    ? null
    : (wx.getStorageSync(ACTIVE_RECOGNITION_KEY) || null);
}

function reconcileAssistant(answer, message, options) {
  const source = answer || {};
  const payload = Object.assign({}, source.payload || {});
  const proposals = Array.isArray(payload.proposals) ? payload.proposals : [];
  const foodProposal = proposals.find(item => item && item.type === "dietLog");
  const content = String(source.content || "");
  const hasImages = Boolean(options && options.hasImages);
  const sourceMessageId = String(options && options.sourceMessageId || "");
  const active = options && options.recognition || getActiveRecognition() || {};
  const metadata = {
    recognitionId: active.id || uniqueId("recognition"),
    source: hasImages ? "image" : "text"
  };
  const contentFoods = extractKnownFoods(`${content}\n${message || ""}`, metadata);
  const proposalFoods = normalizeProposalItems(
    foodProposal && foodProposal.payload && foodProposal.payload.items,
    metadata
  );
  const looksLikeFood = hasImages || Boolean(foodProposal) ||
    /(吃了|喝了|早餐|午餐|晚餐|加餐|餐食|食物|热量|饮食)/.test(`${message || ""}${content}`);
  if (!looksLikeFood) return null;

  // The visible recognition wins over a conflicting proposal. This prevents
  // stale cached items such as white rice from replacing burger/cola results.
  let foods = contentFoods.length ? contentFoods : proposalFoods;
  if (!foods.length && hasImages && nutritionHelper.hasMacroData(payload)) {
    foods = normalizeProposalItems([{
      name: "识别可能不准确，请修改名称",
      amount: 1,
      unit: "份",
      carbs: payload.carbs,
      protein: payload.protein,
      fat: payload.fat,
      confidence: 0.35,
      isEstimatedFood: true
    }], metadata);
  }
  if (!foods.length) return null;

  const result = buildStructuredResult({
    recognitionId: metadata.recognitionId,
    sourceMessageId,
    sourceImageIds: active.sourceImageIds || [],
    source: metadata.source,
    foods,
    explanation: content
  });
  const names = result.foods.map(item => item.displayName).join("、");
  const confidenceNote = result.confidence < 0.45
    ? "\n识别可能不准确，请先修改食物名称和份量，再确认写入。"
    : "";
  const consistentContent = [
    `识别到：${names}。`,
    `按当前份量估算：${result.totalCalories} kcal，蛋白质 ${result.totalProtein}g，碳水 ${result.totalCarbs}g，脂肪 ${result.totalFat}g。`,
    "已使用同一份识别结果生成下方饮食草稿，请选择餐次并确认是否写入。",
    confidenceNote
  ].filter(Boolean).join("\n");
  const proposal = {
    id: String(active.draftId || uniqueId("food-draft")),
    type: "dietLog",
    status: "pending",
    summary: `识别到 ${names}`,
    payload: {
      date: "",
      meal: foodProposal && foodProposal.payload && foodProposal.payload.meal ||
        detectMealType(`${message || ""}\n${content}`),
      items: result.foods,
      recognition: result
    }
  };
  return Object.assign({}, source, {
    type: "diet",
    content: consistentContent,
    payload: Object.assign({}, payload, {
      calories: result.totalCalories,
      carbs: result.totalCarbs,
      protein: result.totalProtein,
      fat: result.totalFat,
      recognition: result,
      proposals: [proposal]
    })
  });
}

module.exports = {
  ACTIVE_RECOGNITION_KEY,
  FOOD_CATALOG,
  beginRecognition,
  getActiveRecognition,
  buildStructuredResult,
  extractKnownFoods,
  reconcileAssistant
};
