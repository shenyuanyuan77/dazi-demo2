const assert = require("assert");
const fs = require("fs");
const path = require("path");

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

const energy = require("../projects/dazi/biz/energy_target_service.js");
const intents = require("../projects/dazi/biz/ai_intent_service.js");
const modes = require("./fixtures/ai_response_mode_service.js");
const workout = require("../helper/workout_calorie_helper.js");

const male = { gender: "男", age: 30, currentWeight: 80, height: 180, goal: "body_shaping" };
assert.strictEqual(energy.calculateBmr({
  gender: "male", age: 30, weight: 80, height: 180
}), 1780);
const shaping = energy.evaluateEnergyTarget(male, { weeklyTrainingFrequency: 3 });
const fatLoss = energy.evaluateEnergyTarget(
  Object.assign({}, male, { goal: "fat_loss" }),
  { weeklyTrainingFrequency: 3 }
);
const muscleGain = energy.evaluateEnergyTarget(
  Object.assign({}, male, { goal: "muscle_gain" }),
  { weeklyTrainingFrequency: 3 }
);
assert.ok(fatLoss.calorieTarget < shaping.calorieTarget);
assert.ok(muscleGain.calorieTarget > shaping.calorieTarget);
assert.ok(fatLoss.calorieTarget >= fatLoss.bmr);
assert.notStrictEqual(
  energy.evaluateEnergyTarget(Object.assign({}, male, { currentWeight: 70 })).calorieTarget,
  energy.evaluateEnergyTarget(Object.assign({}, male, { currentWeight: 90 })).calorieTarget
);
assert.notStrictEqual(
  energy.evaluateEnergyTarget(Object.assign({}, male, { gender: "女" })).calorieTarget,
  shaping.calorieTarget
);

assert.strictEqual(
  intents.routeIntent("生成高蛋白饮食计划", { quickAction: "生成高蛋白饮食计划" }).intent,
  "meal_plan_generation"
);
assert.strictEqual(
  intents.routeIntent("帮我评估今日热量差", { quickAction: "帮我评估今日热量差" }).intent,
  "calorie_gap_evaluation"
);
assert.strictEqual(intents.routeIntent("今天怎么办").responseMode, "ask_clarification");
assert.strictEqual(intents.routeIntent("减脂为什么要吃蛋白质").responseMode, "answer_only");
assert.strictEqual(intents.routeIntent("HIIT 可以天天做吗").responseMode, "answer_only");
assert.strictEqual(
  intents.routeIntent("我刚吃了鸡蛋，不用记录，只分析").intent,
  "food_analysis_only"
);
assert.strictEqual(
  intents.shouldUsePreviousRecognition("meal_plan_generation", "按刚才的生成计划"),
  false
);
assert.strictEqual(
  intents.shouldUsePreviousRecognition("food_analysis_only", "这顿饭适合减脂吗"),
  true
);

const context = {
  userProfile: {
    goal: "muscle_gain",
    calorieTarget: 2300,
    energyAssessment: { bmr: 1700, tdee: 2100 }
  },
  nutritionSummary: {
    totalCalories: 1200,
    macroTargets: { calories: 2300, protein: 160 }
  },
  workoutSummary: { caloriesBurned: 200 },
  goal: { name: "增肌强化" }
};
const gap = modes.buildDeterministicResponse(
  intents.routeIntent("帮我评估今日热量差"),
  context
);
assert.strictEqual(gap.payload.proposals.length, 0);
assert.ok(gap.content.includes("1300"));
const mealPlan = modes.buildDeterministicResponse(
  intents.routeIntent("生成高蛋白饮食计划"),
  context
);
assert.strictEqual(mealPlan.payload.proposals.length, 0);
assert.ok(mealPlan.content.includes("不会写入今天"));

const noExercise = workout.calculateWorkoutCalories({
  exercises: [{
    name: "杠铃深蹲",
    sets: [{ reps: "10", completed: false }]
  }],
  userProfile: { currentWeight: 80 },
  elapsedMinutes: 30
});
assert.strictEqual(noExercise.totalCalories, 0);
const oneCompleted = workout.calculateWorkoutCalories({
  exercises: [{
    name: "杠铃深蹲",
    sets: [{ reps: "10", completed: true }]
  }],
  userProfile: { currentWeight: 80 },
  elapsedMinutes: 30
});
assert.ok(oneCompleted.totalCalories > 0);

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

const appJson = read("app.json");
assert.ok(appJson.includes("floating-input-panel"));
const profileWxml = read("projects/dazi/pages/my/profile/profile_edit.wxml");
assert.ok(profileWxml.includes("avatar-field"));
assert.ok(profileWxml.includes("基础资料"));
assert.ok(profileWxml.includes("身体目标"));
assert.ok(
  read("components/user-profile-header/index.wxml").includes("微信账号已连接")
);
assert.ok(profileWxml.includes("floating-input-panel"));
const bodyWxml = read("projects/dazi/pages/my/body_metrics/body_metrics.wxml");
assert.ok(bodyWxml.includes("uploadBodyScreenshot"));
assert.ok(bodyWxml.includes("识别并预览"));
assert.ok(bodyWxml.includes("togglePendingField"));
const trainingWxml = read("projects/dazi/pages/training/index/training_index.wxml");
assert.ok(trainingWxml.includes("openRestEditor"));
assert.ok(trainingWxml.includes("openSetEditor"));
const tabbarCss = read("components/floating-tabbar/floating-tabbar.wxss");
assert.ok(tabbarCss.includes("isolation: isolate"));
assert.ok(tabbarCss.includes("background: #FFFFFF"));

console.log("Prompt 16 and Prompt 18 feature tests passed");
