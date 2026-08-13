const assert = require("assert");

const storage = {};
global.wx = {
  getStorageSync(key) {
    return Object.prototype.hasOwnProperty.call(storage, key)
      ? JSON.parse(JSON.stringify(storage[key]))
      : "";
  },
  setStorageSync(key, value) {
    storage[key] = JSON.parse(JSON.stringify(value));
  },
  removeStorageSync(key) {
    delete storage[key];
  }
};

const agentRecordService = require("../projects/dazi/biz/agent_record_service.js");
const aiWriteService = require("../projects/dazi/biz/ai_write_service.js");
const bodyMetricsService = require("../projects/dazi/biz/body_metrics_service.js");
const userStorage = require("../projects/dazi/biz/user_storage.js");
const fitnessStore = require("../projects/dazi/store/fitness_store.js");

const today = fitnessStore.dateKey();

userStorage.set("fitness_diet_records", {
  [today]: {
    lunch: [{
      id: "rice-1",
      name: "米饭",
      amount: 150,
      unit: "g",
      calories: 174,
      carbs: 38.9,
      protein: 3.9,
      fat: 0.5
    }, {
      id: "chicken-1",
      name: "鸡胸肉",
      amount: 150,
      unit: "g",
      calories: 248,
      carbs: 0,
      protein: 46.5,
      fat: 5.4
    }]
  }
});

userStorage.set("fitness_training_plan", {
  [today]: [{
    id: "squat",
    name: "深蹲",
    sets: [{ id: "1", reps: "10" }, { id: "2", reps: "10" }, { id: "3", reps: "10" }]
  }, {
    id: "burpee",
    name: "波比跳",
    sets: [{ id: "4", reps: "8" }, { id: "5", reps: "8" }]
  }]
});

const bodySeed = bodyMetricsService.saveConfirmedMetrics({
  weight: 82,
  bodyFatRate: 22.2,
  deviceBmr: 1750
}, { source: "seed" });
assert.strictEqual(bodySeed.success, true);

const dietQuery = agentRecordService.handleLocalIntent("查看今天午餐记录", {
  intent: "diet_record_query"
});
assert.strictEqual(dietQuery.handled, true);
assert.ok(dietQuery.content.includes("米饭"));
assert.ok(dietQuery.content.includes("鸡胸肉"));

const dietDelete = agentRecordService.handleLocalIntent("删除今天午餐的米饭", {
  intent: "diet_record_delete"
}, {
  sourceMessageId: "diet-delete-1"
});
assert.strictEqual(dietDelete.mode, "proposal");
const dietDraft = aiWriteService.createDraftFromProposal(dietDelete.proposal, "diet-delete-1");
aiWriteService.confirmAIWriteDraft(dietDraft.id, "lunch", {
  date: today,
  mealType: "lunch",
  foods: dietDraft.payload.foods,
  operation: dietDraft.payload.operation,
  replaceMeal: true
});
assert.strictEqual(aiWriteService.executeAIWriteDraft(dietDraft.id).status, "success");
assert.deepStrictEqual(
  userStorage.get("fitness_diet_records", {})[today].lunch.map(item => item.name),
  ["鸡胸肉"]
);

const workoutUpdate = agentRecordService.handleLocalIntent("把今天训练计划改成每个项目 6 组", {
  intent: "workout_plan_update"
}, {
  userProfile: { goal: "body_shaping" }
});
assert.strictEqual(workoutUpdate.mode, "proposal");
assert.strictEqual(workoutUpdate.proposal.payload.exercises[0].sets.length, 6);
const workoutDraft = aiWriteService.createDraftFromProposal(workoutUpdate.proposal, "workout-update-1");
aiWriteService.confirmAIWriteDraft(workoutDraft.id, "replace", workoutDraft.payload);
assert.strictEqual(aiWriteService.executeAIWriteDraft(workoutDraft.id).status, "success");
assert.strictEqual(
  userStorage.get("fitness_training_plan", {})[today][0].sets.length,
  6
);

const bodyUpdate = agentRecordService.handleLocalIntent("把刚才体重改成 80.6kg", {
  intent: "body_data_update"
}, {
  sourceMessageId: "body-update-1"
});
assert.strictEqual(bodyUpdate.mode, "proposal");
const bodyDraft = aiWriteService.createDraftFromProposal(bodyUpdate.proposal, "body-update-1");
aiWriteService.confirmAIWriteDraft(bodyDraft.id, "update", bodyDraft.payload);
assert.strictEqual(aiWriteService.executeAIWriteDraft(bodyDraft.id).status, "success");
assert.strictEqual(bodyMetricsService.getLatestRecord().metrics.weight, 80.6);

const bodyDeleteField = agentRecordService.handleLocalIntent("删除刚才的体脂", {
  intent: "body_data_delete"
}, {
  sourceMessageId: "body-delete-1"
});
assert.strictEqual(bodyDeleteField.mode, "proposal");
const deleteDraft = aiWriteService.createDraftFromProposal(bodyDeleteField.proposal, "body-delete-1");
aiWriteService.confirmAIWriteDraft(deleteDraft.id, "delete_fields", deleteDraft.payload);
assert.strictEqual(aiWriteService.executeAIWriteDraft(deleteDraft.id).status, "success");
assert.strictEqual(
  bodyMetricsService.getLatestRecord().metrics.bodyFatRate,
  undefined
);

console.log("Agent record CRUD tests passed");
