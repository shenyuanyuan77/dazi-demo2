const goalConfig = require("../config/goal_config.js");
const nutritionHelper = require("../../../helper/nutrition_helper.js");

function createExerciseSet(source, index) {
  const value = source || {};
  return {
    setIndex: Number(value.setIndex) || index + 1,
    weight: value.weight === undefined ? "" : String(value.weight),
    reps: value.reps === undefined ? "" : String(value.reps),
    completed: Boolean(value.completed || value.done)
  };
}

function createExercise(source) {
  const value = source || {};
  return {
    id: value.id || "",
    name: value.name || "",
    muscleGroups: value.muscleGroups || value.muscles || [],
    instruction: value.instruction || "",
    commonMistakes: value.commonMistakes || [],
    sets: (value.sets || []).map(createExerciseSet)
  };
}

function createMeal(type, foods, warningLevel, aiTip) {
  const list = Array.isArray(foods) ? foods : [];
  const summary = nutritionHelper.summarizeNutrition(list);
  return {
    type,
    foods: list.map(nutritionHelper.normalizeNutritionItem),
    calories: summary.calories,
    carbs: summary.carbs,
    protein: summary.protein,
    fat: summary.fat,
    warningLevel: warningLevel || "normal",
    aiTip: aiTip || ""
  };
}

function createUserProfile(source) {
  const value = source || {};
  return {
    id: value.id || "",
    name: value.name || value.nickname || "健身用户",
    gender: value.gender || "未设置",
    age: Math.max(0, Number(value.age) || 0),
    height: Math.max(0, Number(value.height) || 0),
    weight: Math.max(0, Number(value.weight || value.currentWeight) || 0),
    goal: goalConfig.normalizeGoal(value.goal),
    calorieTarget: Math.max(0, Number(value.calorieTarget) || 0),
    restTimerPreference: Math.max(0, Number(value.restTimerPreference) || 0)
  };
}

function createWorkoutSummary(date, source) {
  const value = source || {};
  const exercises = (value.exercises || []).map(createExercise);
  return {
    date,
    planName: value.planName || "今日训练",
    exercises,
    completed: Boolean(value.completed),
    caloriesBurned: Math.max(0, Math.round(Number(
      value.caloriesBurned || value.totalCalories
    ) || 0))
  };
}

function createNutritionSummary(date, meals, macroTargets) {
  const list = Array.isArray(meals) ? meals : [];
  const summary = nutritionHelper.summarizeNutrition(
    list.reduce((foods, meal) => foods.concat(meal.foods || []), [])
  );
  return {
    date,
    meals: list,
    totalCalories: summary.calories,
    totalCarbs: summary.carbs,
    totalProtein: summary.protein,
    totalFat: summary.fat,
    macroTargets: macroTargets || {}
  };
}

module.exports = {
  createExerciseSet,
  createExercise,
  createMeal,
  createUserProfile,
  createWorkoutSummary,
  createNutritionSummary
};
