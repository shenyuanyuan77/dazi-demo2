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

const service = require("../projects/dazi/biz/ai_write_service.js");
const userStorage = require("../projects/dazi/biz/user_storage.js");

assert.strictEqual(service.detectAIWriteIntent("我刚吃了鸡蛋", []), "food_log");
assert.strictEqual(service.detectAIWriteIntent("帮我生成居家哑铃训练", []), "workout_plan");

const foodDraft = service.createDraftFromProposal({
  id: "food-test",
  type: "dietLog",
  summary: "测试餐",
  uiDate: "2026-06-14",
  uiMeal: "lunch",
  payload: {
    items: [{
      name: "测试餐",
      amount: 1,
      unit: "份",
      carbs: 100,
      protein: 50,
      fat: 20,
      calories: 1,
      confidence: 0.9
    }]
  }
}, "message-1");

assert.strictEqual(foodDraft.status, "pending_confirmation");
assert.deepStrictEqual(userStorage.get("fitness_diet_records", {}), {});

const confirmedFood = service.confirmAIWriteDraft(foodDraft.id, "lunch", {
  date: "2026-06-14",
  mealType: "lunch",
  foods: foodDraft.payload.foods
});
assert.strictEqual(confirmedFood.status, "confirmed");
const foodResult = service.executeAIWriteDraft(foodDraft.id);
assert.strictEqual(foodResult.status, "success");
assert.strictEqual(foodResult.writeResult.verified, true);
assert.strictEqual(service.verifyAIWriteResult(foodDraft.id), true);
const foods = userStorage.get("fitness_diet_records", {})["2026-06-14"].lunch;
assert.strictEqual(foods[0].calories, 780);

const invalidDraft = service.createDraftFromProposal({
  id: "invalid-food",
  type: "dietLog",
  payload: { items: [] }
}, "message-2");
const invalidResult = service.executeAIWriteDraft(invalidDraft.id);
assert.strictEqual(invalidResult.status, "failed");
assert.ok(service.getDraft(invalidDraft.id));

storage["fitness_training_plan:guest"] = {
  "2026-06-14": [{ id: "old", name: "原计划", sets: [{ reps: "10" }] }]
};
const workoutDraft = service.createDraftFromProposal({
  id: "workout-test",
  type: "workoutPlan",
  summary: "新增计划",
  uiDate: "2026-06-14",
  uiWriteMode: "append",
  payload: {
    exercises: [{
      name: "杠铃深蹲",
      sets: [{ reps: 10, weight: 60, restSeconds: 90 }]
    }]
  }
}, "message-3");
service.confirmAIWriteDraft(workoutDraft.id, "append", {
  date: "2026-06-14",
  writeMode: "append",
  exercises: workoutDraft.payload.exercises
});
const workoutResult = service.executeAIWriteDraft(workoutDraft.id);
assert.strictEqual(workoutResult.status, "success");
assert.strictEqual(
  userStorage.get("fitness_training_plan", {})["2026-06-14"].length,
  2
);

console.log("AI write service tests passed");
