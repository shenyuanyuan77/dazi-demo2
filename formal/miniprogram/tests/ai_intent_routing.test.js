const assert = require("assert");
const aiIntentService = require("../projects/dazi/biz/ai_intent_service.js");

const bodyWrite = aiIntentService.routeIntent("记录体重 69.5kg，并同步到身体数据", {});
assert.strictEqual(bodyWrite.intent, "body_data_recognition");
assert.strictEqual(bodyWrite.responseMode, "generate_proposal");
assert.strictEqual(bodyWrite.entities.weight, 69.5);

const bodyAnalysis = aiIntentService.routeIntent("我 180cm，80kg 胖吗", {});
assert.strictEqual(bodyAnalysis.intent, "body_status_evaluation");
assert.strictEqual(bodyAnalysis.responseMode, "analysis_only");

const foodWrite = aiIntentService.routeIntent("把刚才这顿午饭记录一下", {});
assert.strictEqual(foodWrite.intent, "food_log_write");
assert.strictEqual(foodWrite.shouldUseHistory, true);

const mealAdvice = aiIntentService.routeIntent("请根据我的目标和已有记录生成今日饮食建议", {});
assert.strictEqual(mealAdvice.intent, "meal_plan_generation");
assert.strictEqual(mealAdvice.responseMode, "answer_only");

const bodyQuery = aiIntentService.routeIntent("查看今天的身体数据", {});
assert.strictEqual(bodyQuery.intent, "body_data_query");
assert.strictEqual(bodyQuery.responseMode, "answer_only");

const bodyUpdate = aiIntentService.routeIntent("把刚才的体重改成 82.2kg", {});
assert.strictEqual(bodyUpdate.intent, "body_data_update");
assert.strictEqual(bodyUpdate.responseMode, "generate_proposal");

const dietDelete = aiIntentService.routeIntent("删除今天午餐的米饭", {});
assert.strictEqual(dietDelete.intent, "diet_record_delete");
assert.strictEqual(dietDelete.responseMode, "generate_proposal");

const workoutQuery = aiIntentService.routeIntent("查看今天训练计划", {});
assert.strictEqual(workoutQuery.intent, "workout_plan_query");
assert.strictEqual(workoutQuery.responseMode, "answer_only");

const quickAction = aiIntentService.routeIntent("随便说点什么", {
  quickAction: "拍照记饮食"
});
assert.strictEqual(quickAction.intent, "food_log_write");
assert.strictEqual(quickAction.responseMode, "generate_proposal");

const pendingPatch = aiIntentService.routeIntent("每个项目 6 组", {
  pendingProposal: {
    id: "pending-workout",
    type: "workoutPlan",
    payload: {
      exercises: [{
        name: "深蹲",
        sets: [{ reps: "10" }, { reps: "10" }, { reps: "10" }]
      }]
    }
  }
});
assert.strictEqual(pendingPatch.intent, "modify_pending_proposal");
assert.strictEqual(pendingPatch.responseMode, "patch_pending_proposal");
assert.strictEqual(pendingPatch.proposalType, "workoutPlan");

const bareImage = aiIntentService.routeIntent("", { hasImages: true });
assert.strictEqual(bareImage.intent, "image_understanding");
assert.strictEqual(bareImage.responseMode, "generate_proposal");

const unsupported = aiIntentService.routeIntent("为什么肌酸会储水，它的原理是什么", {});
assert.strictEqual(unsupported.intent, "unsupported");
assert.strictEqual(unsupported.supported, false);

console.log("AI intent routing tests passed");
