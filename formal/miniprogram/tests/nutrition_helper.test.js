const assert = require("assert");
const nutritionHelper = require("../helper/nutrition_helper.js");

assert.strictEqual(
  nutritionHelper.calculateCaloriesByMacros(100, 50, 20),
  780
);
assert.strictEqual(
  nutritionHelper.calculateCaloriesByMacros("10", null, -5),
  40
);
assert.strictEqual(
  nutritionHelper.calculateFoodCalories({ calories: "230" }),
  230
);
assert.strictEqual(
  nutritionHelper.calculateFoodCalories({
    calories: 999,
    carbs: 10,
    protein: 5,
    fat: 2
  }),
  78
);
assert.deepStrictEqual(
  nutritionHelper.summarizeNutrition([
    { calories: 100 },
    { carbs: 10, protein: 5, fat: 2 }
  ]),
  { calories: 178, carbs: 10, protein: 5, fat: 2 }
);

const storage = {};
global.wx = {
  getStorageSync(key) {
    return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : "";
  },
  setStorageSync(key, value) {
    storage[key] = value;
  },
  removeStorageSync(key) {
    delete storage[key];
  }
};

const dashboardService = require("../projects/dazi/biz/dashboard_service.js");
const date = dashboardService.todayKey();
storage.fitness_app_settings = { calorieGoal: 2000 };
storage["fitness_diet_records:guest"] = {
  [date]: {
    dinner: [{
      name: "测试餐",
      calories: 999,
      carbs: 100,
      protein: 50,
      fat: 20
    }]
  }
};
storage["fitness_training_plan:guest"] = {
  [date]: [{
    name: "杠铃深蹲",
    sets: [{ done: true }, { done: false }]
  }]
};
storage["fitness_workout_stats:guest"] = {
  [date]: { totalCalories: 20 }
};

const dashboard = dashboardService.getDashboardData();
assert.strictEqual(dashboard.calories.consumed, 780);
assert.strictEqual(dashboard.calories.exercise, 20);
assert.strictEqual(dashboard.calories.remaining, 1240);
assert.strictEqual(
  dashboard.tasks.find(item => item.id === "meal-dinner").completed,
  true
);
assert.strictEqual(dashboard.macroList.length, 3);

console.log("nutrition_helper tests passed");
