const nutritionHelper = require("../../../helper/nutrition_helper.js");
const goalConfig = require("../config/goal_config.js");

const DEFAULT_TARGETS = {
  calories: 1800,
  carbs: 220,
  protein: 120,
  fat: 60
};

const GOAL_STRATEGIES = {
  [goalConfig.GOAL_TYPES.FAT_LOSS]: { warningMultiplier: 0.95, proteinFloor: 0.9 },
  [goalConfig.GOAL_TYPES.MUSCLE_GAIN]: { warningMultiplier: 1.15, proteinFloor: 0.95 },
  [goalConfig.GOAL_TYPES.BODY_SHAPING]: { warningMultiplier: 1.05, proteinFloor: 0.88 }
};

const MEAL_ALLOCATIONS = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.3,
  snack: 0.1
};

function round(value, precision) {
  const factor = Math.pow(10, precision || 0);
  return Math.round(value * factor) / factor;
}

function percent(value, target) {
  if (!target) return 0;
  return Math.max(0, Math.round(value / target * 100));
}

function getDailyTargets(settings, goal) {
  const source = settings || {};
  const calorieTarget = nutritionHelper.toNonNegativeNumber(source.calorieGoal) ||
    DEFAULT_TARGETS.calories;
  const macroTargets = goalConfig.getMacroTargetsByGoal(goal, calorieTarget);
  return {
    calories: calorieTarget,
    carbs: nutritionHelper.toNonNegativeNumber(source.carbsGoal) || macroTargets.carbsGram,
    protein: nutritionHelper.toNonNegativeNumber(source.proteinGoal) || macroTargets.proteinGram,
    fat: nutritionHelper.toNonNegativeNumber(source.fatGoal) || macroTargets.fatGram
  };
}

function buildDailyMetrics(summary, targets) {
  return [
    {
      key: "calories",
      label: "总热量",
      value: summary.calories,
      target: targets.calories,
      unit: "kcal",
      percent: Math.min(100, percent(summary.calories, targets.calories)),
      tone: "blue"
    },
    {
      key: "carbs",
      label: "碳水",
      value: summary.carbs,
      target: targets.carbs,
      unit: "g",
      percent: Math.min(100, percent(summary.carbs, targets.carbs)),
      tone: "cyan"
    },
    {
      key: "protein",
      label: "蛋白质",
      value: summary.protein,
      target: targets.protein,
      unit: "g",
      percent: Math.min(100, percent(summary.protein, targets.protein)),
      tone: "green"
    },
    {
      key: "fat",
      label: "脂肪",
      value: summary.fat,
      target: targets.fat,
      unit: "g",
      percent: Math.min(100, percent(summary.fat, targets.fat)),
      tone: "orange"
    }
  ];
}

function createMealTargets(mealKey, dailyTargets) {
  const allocation = MEAL_ALLOCATIONS[mealKey] || MEAL_ALLOCATIONS.snack;
  return {
    calories: Math.round(dailyTargets.calories * allocation),
    carbs: round(dailyTargets.carbs * allocation, 1),
    protein: round(dailyTargets.protein * allocation, 1),
    fat: round(dailyTargets.fat * allocation, 1)
  };
}

function createAdvice(meal, issues, goal) {
  if (!issues.length || !meal.items.length) return "";
  const type = goalConfig.normalizeGoal(goal);
  const names = {
    calories: "热量",
    fat: "脂肪",
    carbs: "碳水",
    protein: "蛋白质"
  };
  const primary = issues[0];
  if (primary.key === "fat") {
    return `${meal.name}脂肪摄入偏高，下一餐建议选择鸡胸肉、虾仁、豆腐等高蛋白低脂食材。`;
  }
  if (primary.key === "carbs") {
    return type === goalConfig.GOAL_TYPES.FAT_LOSS
      ? `${meal.name}碳水偏高，减脂阶段下一餐请减少精致碳水，改选杂粮、蔬菜和优质蛋白。`
      : `${meal.name}碳水摄入偏高，下一餐建议调整主食份量，并增加蔬菜和优质蛋白。`;
  }
  if (primary.key === "protein") {
    return type === goalConfig.GOAL_TYPES.MUSCLE_GAIN
      ? `${meal.name}蛋白质不足，建议增加牛奶、鸡蛋或乳清蛋白加餐，支持肌肉生长。`
      : `${meal.name}蛋白质不足，建议补充鸡蛋、牛奶、鱼虾或豆制品。`;
  }
  const secondary = issues[1] ? `，同时${names[issues[1].key]}也需留意` : "";
  return `${meal.name}摄入 ${meal.summary.calories} kcal，热量偏高${secondary}，下一餐建议清淡并控制份量。`;
}

function analyzeMeal(meal, dailyTargets, goal) {
  const summary = nutritionHelper.summarizeNutrition(meal.items);
  const targets = createMealTargets(meal.key, dailyTargets);
  const normalizedGoal = goalConfig.normalizeGoal(goal);
  const strategy = GOAL_STRATEGIES[normalizedGoal];
  const redThreshold = 1.2 * strategy.warningMultiplier;
  const issues = [];

  ["calories", "fat", "carbs"].forEach(key => {
    const ratio = targets[key] ? summary[key] / targets[key] : 0;
    if (ratio > redThreshold) issues.push({ key, level: "danger", ratio });
    else if (ratio >= 0.9 * strategy.warningMultiplier) {
      issues.push({ key, level: "warning", ratio });
    }
  });

  if (
    meal.items.length &&
    targets.protein &&
    summary.protein / targets.protein < strategy.proteinFloor
  ) {
    issues.push({
      key: "protein",
      level: "warning",
      ratio: summary.protein / targets.protein
    });
  }

  issues.sort((a, b) => {
    if (a.level !== b.level) return a.level === "danger" ? -1 : 1;
    return b.ratio - a.ratio;
  });
  const status = issues.some(item => item.level === "danger")
    ? "danger"
    : (issues.length ? "warning" : "normal");

  return Object.assign({}, meal, {
    items: meal.items.map(nutritionHelper.normalizeNutritionItem),
    summary,
    targets,
    status,
    statusLabel: status === "danger" ? "已超标" : (status === "warning" ? "接近上限" : "正常"),
    advice: createAdvice(Object.assign({}, meal, { summary }), issues, normalizedGoal),
    issues: issues.map(item => item.key)
  });
}

function analyzeDiet(meals, settings, goal) {
  const targets = getDailyTargets(settings, goal);
  const source = Array.isArray(meals) ? meals : [];
  const allItems = source.reduce((items, meal) => items.concat(meal.items || []), []);
  const summary = nutritionHelper.summarizeNutrition(allItems);
  return {
    summary,
    targets,
    dailyMetrics: buildDailyMetrics(summary, targets),
    meals: source.map(meal => analyzeMeal(meal, targets, goal))
  };
}

module.exports = {
  DEFAULT_TARGETS,
  GOAL_STRATEGIES,
  MEAL_ALLOCATIONS,
  analyzeDiet,
  analyzeMeal,
  getDailyTargets
};
