const assert = require("assert");
const dietAnalysis = require("../projects/dazi/biz/diet_analysis_service.js");
const workoutHelper = require("../helper/workout_calorie_helper.js");
const exerciseLibrary = require("../projects/dazi/biz/exercise_library.js");

const diet = dietAnalysis.analyzeDiet([
  {
    key: "lunch",
    name: "午餐",
    items: [{
      name: "高脂午餐",
      carbs: 100,
      protein: 10,
      fat: 40
    }]
  }
], {
  calorieGoal: 1800,
  carbsGoal: 220,
  proteinGoal: 120,
  fatGoal: 60
}, "减脂");

assert.strictEqual(diet.dailyMetrics.length, 4);
assert.strictEqual(diet.meals[0].status, "danger");
assert.ok(diet.meals[0].issues.includes("fat"));
assert.ok(diet.meals[0].issues.includes("carbs"));
assert.ok(diet.meals[0].issues.includes("protein"));
assert.ok(diet.meals[0].advice.includes("脂肪"));

assert.strictEqual(
  workoutHelper.calculateExerciseCalories({
    met: 6,
    weight: 60,
    durationMinutes: 30
  }),
  180
);
assert.strictEqual(
  workoutHelper.calculateExerciseCalories({
    met: 6,
    weight: 80,
    durationMinutes: 30
  }),
  240
);

const normalized = workoutHelper.normalizeExercise({
  name: "Barbell Back Squat",
  sets: [{ id: 1, weight: "60", reps: "10", done: true }]
}, 0);
assert.strictEqual(normalized.name, "杠铃深蹲");
assert.strictEqual(normalized.sets[0].completed, true);

const summary = workoutHelper.calculateWorkoutCalories({
  exercises: [{
    name: "杠铃深蹲",
    sets: [
      { reps: 10, completed: true },
      { reps: 10, completed: true }
    ]
  }],
  userProfile: {
    currentWeight: 80,
    height: 180,
    gender: "男",
    birthday: "1995-01-01",
    goal: "增肌"
  },
  elapsedMinutes: 20
});

assert.strictEqual(summary.completedExercises, 1);
assert.strictEqual(summary.completedSets, 2);
assert.ok(summary.totalCalories > 0);
assert.ok(summary.muscles.includes("股四头肌"));
assert.strictEqual(summary.profile.missingFields.length, 0);
assert.strictEqual(exerciseLibrary.getExerciseConfig("波比跳").met, 8);

const storage = {};
global.wx = {
  getSystemInfoSync() {
    return { statusBarHeight: 44 };
  },
  getStorageSync(key) {
    return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : "";
  },
  setStorageSync(key, value) {
    storage[key] = value;
  },
  removeStorageSync(key) {
    delete storage[key];
  },
  showToast() {},
  vibrateLong() {},
  navigateTo() {}
};

let trainingPage = null;
global.Page = definition => {
  trainingPage = definition;
};
require("../projects/dazi/pages/training/index/training_index.js");

const page = Object.assign({}, trainingPage, {
  data: JSON.parse(JSON.stringify(trainingPage.data)),
  setData(patch) {
    this.data = Object.assign({}, this.data, patch);
  }
});
page.onLoad();
page.toggleSet({
  currentTarget: {
    dataset: {
      exercise: page.data.exercises[0].id,
      set: page.data.exercises[0].sets[0].id
    }
  }
});
assert.strictEqual(page.data.exercises[0].sets[0].completed, true);
assert.strictEqual(page.data.restTimer.visible, true);
assert.strictEqual(page.data.restTimer.remaining, 60);
page.pauseRestTimer();
assert.strictEqual(page.data.restTimer.running, false);
page.resumeRestTimer();
assert.strictEqual(page.data.restTimer.running, true);
page.skipRestTimer();
assert.strictEqual(page.data.restTimer.visible, false);
const secondSetId = page.data.exercises[0].sets[1].id;
page.toggleSet({
  currentTarget: {
    dataset: {
      exercise: page.data.exercises[0].id,
      set: secondSetId
    }
  }
});
assert.strictEqual(page.data.restTimer.visible, true);
page.toggleSet({
  currentTarget: {
    dataset: {
      exercise: page.data.exercises[0].id,
      set: secondSetId
    }
  }
});
assert.strictEqual(page.data.restTimer.visible, false);
page.toggleSet({
  currentTarget: {
    dataset: {
      exercise: page.data.exercises[0].id,
      set: page.data.exercises[0].sets[0].id
    }
  }
});
assert.strictEqual(page.data.restTimer.visible, false);

console.log("P1 feature tests passed");
