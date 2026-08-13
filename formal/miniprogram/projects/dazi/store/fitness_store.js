const userStorage = require("../biz/user_storage.js");
const goalConfig = require("../config/goal_config.js");
const models = require("../models/fitness_models.js");
const energyTargetService = require("../biz/energy_target_service.js");

const PROFILE_KEY = "fitness_profile";
const DIET_KEY = "fitness_diet_records";
const TRAINING_KEY = "fitness_training_plan";
const WORKOUT_STATS_KEY = "fitness_workout_stats";
const SETTINGS_KEY = "fitness_app_settings";
const WEIGHT_HISTORY_KEY = "fitness_weight_history";

function pad(value) {
  return String(value).padStart(2, "0");
}

function dateKey(date) {
  const value = date || new Date();
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function getRawProfile() {
  const profile = userStorage.get(PROFILE_KEY, {});
  const settings = wx.getStorageSync(SETTINGS_KEY) || {};
  const dynamic = energyTargetService.evaluateEnergyTarget(profile, {
    weeklyTrainingFrequency: getWeeklyTrainingFrequency()
  });
  const legacyManualTarget = settings.calorieGoalManual === undefined &&
    Number(settings.calorieGoal) > 0 &&
    Number(settings.calorieGoal) !== 1800;
  const manualTarget = (settings.calorieGoalManual || legacyManualTarget)
    ? Number(settings.calorieGoal)
    : 0;
  return Object.assign({}, profile, {
    calorieTarget: manualTarget || dynamic.calorieTarget,
    energyAssessment: dynamic,
    restTimerPreference: Number(settings.restSeconds || profile.restTimerPreference) || 0
  });
}

function getUserProfile() {
  const raw = getRawProfile();
  const profile = models.createUserProfile(raw);
  return Object.assign({}, profile, {
    raw,
    goalConfig: goalConfig.getGoalConfig(profile.goal),
    energyAssessment: raw.energyAssessment
  });
}

function getNutritionSummary(date) {
  const key = date || dateKey();
  const profile = getUserProfile();
  const targets = goalConfig.getMacroTargetsByGoal(profile.goal, profile.calorieTarget);
  const records = userStorage.get(DIET_KEY, {});
  const record = records[key] || {};
  const mealTypes = ["breakfast", "lunch", "dinner", "snack"];
  const meals = mealTypes.map(type => models.createMeal(type, record[type] || []));
  return models.createNutritionSummary(key, meals, {
    calories: profile.calorieTarget,
    carbs: targets.carbsGram,
    protein: targets.proteinGram,
    fat: targets.fatGram
  });
}

function getWorkoutSummary(date) {
  const key = date || dateKey();
  const plans = userStorage.get(TRAINING_KEY, {});
  const stats = userStorage.get(WORKOUT_STATS_KEY, {});
  return models.createWorkoutSummary(key, Object.assign({}, stats[key] || {}, {
    exercises: plans[key] || []
  }));
}

function getWeeklyTrainingFrequency() {
  const stats = userStorage.get(WORKOUT_STATS_KEY, {});
  const now = new Date();
  let count = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    const item = stats[dateKey(date)] || {};
    if (item.startedAt || item.completedSets > 0 || item.completed) count += 1;
  }
  return count;
}

function setGoal(goal) {
  const normalized = goalConfig.normalizeGoal(goal);
  const profile = Object.assign({}, userStorage.get(PROFILE_KEY, {}), {
    goal: normalized
  });
  userStorage.set(PROFILE_KEY, profile);
  return normalized;
}

function recordWeight(weight, date) {
  const value = Math.max(0, Number(weight) || 0);
  if (!value) return [];
  const history = userStorage.get(WEIGHT_HISTORY_KEY, []);
  const key = date || dateKey();
  const next = history.filter(item => item.date !== key);
  next.push({ date: key, value });
  next.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const trimmed = next.slice(-180);
  userStorage.set(WEIGHT_HISTORY_KEY, trimmed);
  return trimmed;
}

function getWeightHistory() {
  const history = userStorage.get(WEIGHT_HISTORY_KEY, []);
  if (history.length) return history.slice(-30);
  const profile = getUserProfile();
  return profile.weight ? [{ date: dateKey(), value: profile.weight }] : [];
}

function getState() {
  return {
    userProfile: getUserProfile(),
    nutritionSummary: getNutritionSummary(),
    workoutSummary: getWorkoutSummary(),
    weeklyTrainingFrequency: getWeeklyTrainingFrequency()
  };
}

module.exports = {
  PROFILE_KEY,
  DIET_KEY,
  TRAINING_KEY,
  WORKOUT_STATS_KEY,
  SETTINGS_KEY,
  WEIGHT_HISTORY_KEY,
  dateKey,
  getState,
  getUserProfile,
  getNutritionSummary,
  getWorkoutSummary,
  getWeeklyTrainingFrequency,
  getWeightHistory,
  recordWeight,
  setGoal
};
