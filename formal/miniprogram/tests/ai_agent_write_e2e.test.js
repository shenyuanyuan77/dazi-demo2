const assert = require("assert");

const storage = {};
let failOnceKey = "";

function clone(value) {
  if (value === "" || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

global.wx = {
  getStorageSync(key) {
    return Object.prototype.hasOwnProperty.call(storage, key)
      ? clone(storage[key])
      : "";
  },
  setStorageSync(key, value) {
    if (key === failOnceKey) {
      failOnceKey = "";
      throw new Error("模拟本地存储失败");
    }
    storage[key] = clone(value);
  },
  removeStorageSync(key) {
    delete storage[key];
  }
};

const service = require("../projects/dazi/biz/ai_write_service.js");
const userStorage = require("../projects/dazi/biz/user_storage.js");
const dashboardService = require("../projects/dazi/biz/dashboard_service.js");
const coachContextService = require("../projects/dazi/biz/coach_context_service.js");
const fitnessStore = require("../projects/dazi/store/fitness_store.js");

const today = fitnessStore.dateKey();
const tomorrowDate = new Date();
tomorrowDate.setDate(tomorrowDate.getDate() + 1);
const tomorrow = fitnessStore.dateKey(tomorrowDate);

userStorage.set("fitness_profile", {
  name: "测试用户",
  currentWeight: 70,
  weight: 70,
  height: 175,
  goal: "muscle_gain",
  calorieTarget: 2200
});

function foodProposal(id, overrides) {
  return {
    id,
    type: "dietLog",
    summary: "AI 饮食草稿",
    uiDate: today,
    uiMeal: "lunch",
    payload: {
      items: [Object.assign({
        name: "鸡胸肉",
        amount: 150,
        unit: "g",
        carbs: 0,
        protein: 46.5,
        fat: 5.4,
        confidence: 0.9
      }, overrides || {})]
    }
  };
}

function workoutProposal(id, mode, date) {
  return {
    id,
    type: "workoutPlan",
    summary: "AI 腿部训练",
    uiDate: date || today,
    uiWriteMode: mode || "append",
    payload: {
      planName: "腿部训练",
      goal: "muscle_gain",
      exercises: [{
        name: "杯式深蹲",
        muscleGroups: ["股四头肌", "臀大肌"],
        instruction: "膝盖与脚尖同向",
        sets: [
          { setIndex: 1, weight: 20, reps: 10, restSeconds: 105 },
          { setIndex: 2, weight: 20, reps: 10, restSeconds: 105 }
        ]
      }]
    }
  };
}

const cancelled = service.createDraftFromProposal(foodProposal("cancelled-food"), "m1");
assert.deepStrictEqual(userStorage.get("fitness_diet_records", {}), {});
service.cancelAIWriteDraft(cancelled.id);
assert.strictEqual(service.executeAIWriteDraft(cancelled.id).status, "cancelled");
assert.deepStrictEqual(userStorage.get("fitness_diet_records", {}), {});

const pending = service.createDraftFromProposal(foodProposal("pending-food"), "m2");
const pendingExecution = service.executeAIWriteDraft(pending.id);
assert.strictEqual(pendingExecution.status, "failed");
assert.ok(pendingExecution.writeResult.errorMessage.includes("尚未由用户确认"));
assert.deepStrictEqual(userStorage.get("fitness_diet_records", {}), {});

const validFood = service.createDraftFromProposal(foodProposal("valid-food"), "m3");
service.confirmAIWriteDraft(validFood.id, "lunch", {
  date: today,
  mealType: "lunch",
  foods: validFood.payload.foods
});
const foodResult = service.executeAIWriteDraft(validFood.id);
assert.strictEqual(foodResult.status, "success");
assert.deepStrictEqual(foodResult.writeResult.verification, {
  storage: true,
  store: true,
  dashboard: true
});
for (let index = 0; index < 5; index += 1) {
  assert.strictEqual(service.executeAIWriteDraft(validFood.id).status, "success");
}
const writtenFoods = userStorage.get("fitness_diet_records", {})[today].lunch;
assert.strictEqual(
  writtenFoods.filter(item => item.aiDraftId === validFood.id).length,
  1
);
assert.strictEqual(
  dashboardService.getDashboardData().calories.consumed,
  fitnessStore.getNutritionSummary(today).totalCalories
);
assert.ok(coachContextService.buildCoachContext().nutritionSummary.totalProtein > 0);

const negativeFood = service.createDraftFromProposal(
  foodProposal("negative-food", { fat: -5 }),
  "m4"
);
const negativeConfirmed = service.confirmAIWriteDraft(negativeFood.id, "lunch", {
  date: today,
  mealType: "lunch",
  foods: negativeFood.payload.foods
});
assert.ok(negativeConfirmed.validationErrors.some(error => error.includes("不能为负数")));

const lowConfidence = service.createDraftFromProposal(
  foodProposal("low-confidence", { confidence: 0.2 }),
  "m5"
);
const lowConfidenceConfirmed = service.confirmAIWriteDraft(lowConfidence.id, "lunch", {
  date: today,
  mealType: "lunch",
  foods: lowConfidence.payload.foods
});
assert.ok(lowConfidenceConfirmed.validationErrors.some(error => error.includes("置信度过低")));

const invalidDate = service.createDraftFromProposal(foodProposal("invalid-date"), "m6");
const invalidDateConfirmed = service.confirmAIWriteDraft(invalidDate.id, "lunch", {
  date: "2026-02-31",
  mealType: "lunch",
  foods: invalidDate.payload.foods
});
assert.ok(invalidDateConfirmed.validationErrors.includes("当前日期无效"));

userStorage.set("fitness_training_plan", {
  [today]: [{ id: "old", name: "旧训练", sets: [{ id: "old-set", reps: "10" }] }]
});
const appended = service.createDraftFromProposal(
  workoutProposal("append-workout", "append"),
  "m7"
);
service.confirmAIWriteDraft(appended.id, "append", appended.payload);
const appendedResult = service.executeAIWriteDraft(appended.id);
assert.strictEqual(appendedResult.status, "success");
assert.strictEqual(userStorage.get("fitness_training_plan", {})[today].length, 2);
assert.ok(
  dashboardService.getDashboardData().tasks.some(task => task.type === "training")
);
for (let index = 0; index < 5; index += 1) {
  service.executeAIWriteDraft(appended.id);
}
assert.strictEqual(
  userStorage.get("fitness_training_plan", {})[today]
    .filter(item => item.aiDraftId === appended.id).length,
  1
);

const replaced = service.createDraftFromProposal(
  workoutProposal("replace-workout", "replace"),
  "m8"
);
service.confirmAIWriteDraft(replaced.id, "replace", replaced.payload);
assert.strictEqual(service.executeAIWriteDraft(replaced.id).status, "success");
assert.strictEqual(userStorage.get("fitness_training_plan", {})[today].length, 1);
assert.strictEqual(userStorage.get("fitness_training_plan", {})[today][0].aiDraftId, replaced.id);

const tomorrowDraft = service.createDraftFromProposal(
  workoutProposal("tomorrow-workout", "append", tomorrow),
  "m9"
);
service.confirmAIWriteDraft(tomorrowDraft.id, "append", tomorrowDraft.payload);
assert.strictEqual(service.executeAIWriteDraft(tomorrowDraft.id).status, "success");
assert.ok(userStorage.get("fitness_training_plan", {})[tomorrow].length);

const weeklyDraft = service.createDraftFromProposal(
  workoutProposal("weekly-workout", "week"),
  "m10"
);
service.confirmAIWriteDraft(weeklyDraft.id, "week", weeklyDraft.payload);
assert.strictEqual(service.executeAIWriteDraft(weeklyDraft.id).status, "success");
assert.strictEqual(userStorage.get("fitness_weekly_training_plans", []).length, 1);

const templateDraft = service.createDraftFromProposal(
  workoutProposal("template-workout", "template"),
  "m11"
);
service.confirmAIWriteDraft(templateDraft.id, "template", templateDraft.payload);
assert.strictEqual(service.executeAIWriteDraft(templateDraft.id).status, "success");
assert.strictEqual(userStorage.get("fitness_training_templates", []).length, 1);

const retryDraft = service.createDraftFromProposal(foodProposal("retry-food"), "m12");
service.confirmAIWriteDraft(retryDraft.id, "lunch", {
  date: today,
  mealType: "lunch",
  foods: retryDraft.payload.foods
});
failOnceKey = "fitness_diet_records:guest";
assert.strictEqual(service.executeAIWriteDraft(retryDraft.id).status, "failed");
assert.strictEqual(service.retryAIWriteDraft(retryDraft.id).status, "success");
assert.strictEqual(
  userStorage.get("fitness_diet_records", {})[today].lunch
    .filter(item => item.aiDraftId === retryDraft.id).length,
  1
);

const profileDraft = service.createDraftFromProposal({
  id: "profile-write",
  type: "profilePatch",
  summary: "同步身体数据",
  payload: { profilePatch: { currentWeight: "69.5", targetWeight: "65" } }
}, "m13");
service.confirmAIWriteDraft(profileDraft.id, "profile", profileDraft.payload);
assert.strictEqual(service.executeAIWriteDraft(profileDraft.id).status, "success");
assert.strictEqual(userStorage.get("fitness_profile", {}).currentWeight, "69.5");

assert.strictEqual(
  service.detectAIWriteIntent("不用记录，只分析午餐热量", []),
  ""
);
assert.ok(service.getDraft(validFood.id).statusHistory.length >= 4);

const emptyProfileDraft = service.createDraftFromProposal({
  id: "profile-empty",
  type: "profilePatch",
  summary: "绌虹櫧韬綋鏁版嵁",
  payload: { profilePatch: {} }
}, "m14");
const emptyProfileConfirmed = service.confirmAIWriteDraft(
  emptyProfileDraft.id,
  "profile",
  emptyProfileDraft.payload
);
assert.ok(emptyProfileConfirmed.validationErrors.includes("没有可写入的身体数据"));

console.log("AI agent write end-to-end tests passed");
