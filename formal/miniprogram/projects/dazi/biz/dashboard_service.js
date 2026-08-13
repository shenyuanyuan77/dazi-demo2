const nutritionHelper = require("../../../helper/nutrition_helper.js");
const userStorage = require("./user_storage.js");
const fitnessStore = require("../store/fitness_store.js");
const goalConfig = require("../config/goal_config.js");
const dashboardAdviceService = require("./dashboard_advice_service.js");

const DIET_KEY = "fitness_diet_records";
const TRAINING_KEY = "fitness_training_plan";
const WORKOUT_STATS_KEY = "fitness_workout_stats";
const SETTINGS_KEY = "fitness_app_settings";

const DEFAULT_TARGETS = {
  calories: 1800,
  carbs: 220,
  protein: 120,
  fat: 60
};

const MEALS = [
  { key: "breakfast", label: "早餐" },
  { key: "lunch", label: "午餐" },
  { key: "dinner", label: "晚餐" }
];

function pad(value) {
  return String(value).padStart(2, "0");
}

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function percentage(value, target) {
  if (!target) return 0;
  return Math.min(100, Math.max(0, Math.round(value / target * 100)));
}

function flattenMeals(record) {
  return Object.keys(record || {}).reduce((items, key) => {
    const mealItems = Array.isArray(record[key]) ? record[key] : [];
    return items.concat(mealItems);
  }, []);
}

function createMacro(label, key, value, target, tone) {
  return {
    label,
    key,
    value,
    target,
    percent: percentage(value, target),
    tone
  };
}

function getTrainingState(exercises, workoutStats) {
  const source = Array.isArray(exercises) ? exercises : [];
  const totalSets = source.reduce((sum, exercise) => (
    sum + (Array.isArray(exercise.sets) ? exercise.sets.length : 0)
  ), 0);
  const completedSets = source.reduce((sum, exercise) => (
    sum + (Array.isArray(exercise.sets)
      ? exercise.sets.filter(set => set.done).length
      : 0)
  ), 0);
  return {
    exercises: source,
    totalSets,
    completedSets,
    completed: totalSets > 0 && completedSets === totalSets,
    started: completedSets > 0,
    exerciseCalories: Math.max(
      0,
      Math.round(Number(workoutStats && workoutStats.totalCalories) || 0)
    )
  };
}

function buildTasks(record, training) {
  const dietTasks = MEALS.map(meal => {
    const completed = Array.isArray(record[meal.key]) && record[meal.key].length > 0;
    return {
      id: `meal-${meal.key}`,
      type: "diet",
      title: `${meal.label}${completed ? "已记录" : "待记录"}`,
      detail: completed ? "查看或继续添加" : `点击记录${meal.label}`,
      completed
    };
  });

  const firstExercise = training.exercises[0];
  const title = firstExercise
    ? `今日训练：${firstExercise.name}`
    : "今日核心训练：杠铃深蹲";
  const detail = training.completed
    ? "已完成"
    : (training.started
      ? `进行中 · ${training.completedSets}/${training.totalSets} 组`
      : "未开始");

  return dietTasks.concat({
    id: "training-today",
    type: "training",
    title,
    detail,
    completed: training.completed
  });
}

function getDashboardData() {
  const date = todayKey();
  const records = userStorage.get(DIET_KEY, {});
  const record = records[date] || {};
  const summary = nutritionHelper.summarizeNutrition(flattenMeals(record));
  const settings = wx.getStorageSync(SETTINGS_KEY) || {};
  const profile = fitnessStore.getUserProfile();
  const config = goalConfig.getGoalConfig(profile.goal);
  const legacyManualTarget = settings.calorieGoalManual === undefined &&
    Number(settings.calorieGoal) > 0 &&
    Number(settings.calorieGoal) !== DEFAULT_TARGETS.calories;
  const calorieTarget = (settings.calorieGoalManual || legacyManualTarget)
    ? nutritionHelper.toNonNegativeNumber(settings.calorieGoal)
    : (profile.calorieTarget || DEFAULT_TARGETS.calories);
  const macroTargets = goalConfig.getMacroTargetsByGoal(profile.goal, calorieTarget);
  const targets = {
    calories: calorieTarget,
    carbs: nutritionHelper.toNonNegativeNumber(settings.carbsGoal) || macroTargets.carbsGram,
    protein: nutritionHelper.toNonNegativeNumber(settings.proteinGoal) || macroTargets.proteinGram,
    fat: nutritionHelper.toNonNegativeNumber(settings.fatGoal) || macroTargets.fatGram
  };
  const plans = userStorage.get(TRAINING_KEY, {});
  const workoutStats = userStorage.get(WORKOUT_STATS_KEY, {});
  const training = getTrainingState(plans[date], workoutStats[date]);
  const remainingCalories = Math.round(
    targets.calories - summary.calories + training.exerciseCalories
  );
  const macros = {
    carbs: createMacro("碳水", "carbs", summary.carbs, targets.carbs, "blue"),
    protein: createMacro("蛋白质", "protein", summary.protein, targets.protein, "green"),
    fat: createMacro("脂肪", "fat", summary.fat, targets.fat, "orange")
  };

  return {
    date,
    calories: {
      target: targets.calories,
      consumed: summary.calories,
      exercise: training.exerciseCalories,
      remaining: remainingCalories,
      progress: percentage(summary.calories, targets.calories + training.exerciseCalories),
      percent: Math.min(100, Math.round(
        (summary.calories / Math.max(1, targets.calories + training.exerciseCalories)) * 100
      ))
    },
    macroList: [macros.carbs, macros.protein, macros.fat],
    tasks: buildTasks(record, training),
    advice: dashboardAdviceService.buildDashboardAdvice({
      profile,
      summary,
      targets,
      remainingCalories,
      training,
      config
    }),
    goal: {
      type: config.goalType,
      name: config.name,
      shortName: config.shortName || config.name,
      focus: config.homeFocus
    }
  };
}

module.exports = {
  DEFAULT_TARGETS,
  getDashboardData,
  todayKey
};
