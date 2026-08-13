const assert = require("assert");

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

const store = require("../projects/dazi/store/fitness_store.js");
const coachService = require("../projects/dazi/biz/coach_context_service.js");

const today = store.dateKey();
storage.fitness_app_settings = { calorieGoal: 1800 };
storage["fitness_diet_records:guest"] = {
  [today]: {
    lunch: [{
      name: "测试餐",
      carbs: 100,
      protein: 50,
      fat: 20,
      calories: 1
    }]
  }
};
storage["fitness_training_plan:guest"] = {
  [today]: [{
    id: 1,
    name: "杠铃深蹲",
    sets: [{ completed: true, weight: "60", reps: "10" }]
  }]
};
storage["fitness_workout_stats:guest"] = {
  [today]: {
    completed: true,
    totalCalories: 180,
    completedSets: 1
  }
};

store.setGoal("增肌");
const state = store.getState();
assert.strictEqual(state.userProfile.goal, "muscle_gain");
assert.strictEqual(state.nutritionSummary.totalCalories, 780);
assert.strictEqual(
  state.nutritionSummary.macroTargets.carbs,
  Math.round(state.userProfile.calorieTarget * 0.5 / 4)
);
assert.strictEqual(state.workoutSummary.caloriesBurned, 180);
assert.strictEqual(state.workoutSummary.completed, true);

const context = coachService.buildCoachContext();
assert.strictEqual(context.goal.goalType, "muscle_gain");
assert.strictEqual(
  context.remainingCalories,
  state.userProfile.calorieTarget - 780 + 180
);
assert.ok(coachService.buildProactiveGreeting(context).includes("蛋白质"));

console.log("store integration tests passed");
