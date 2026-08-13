const assert = require("assert");
const goalConfig = require("../projects/dazi/config/goal_config.js");
const coachService = require("../projects/dazi/biz/coach_context_service.js");

const fatLoss = goalConfig.getMacroTargetsByGoal("fat_loss", 1800);
assert.deepStrictEqual(fatLoss, {
  carbsCalories: 720,
  proteinCalories: 630,
  fatCalories: 450,
  carbsGram: 180,
  proteinGram: 158,
  fatGram: 50
});

const muscleGain = goalConfig.getMacroTargetsByGoal("增肌", 2000);
assert.strictEqual(muscleGain.carbsGram, 250);
assert.strictEqual(muscleGain.proteinGram, 150);
assert.strictEqual(muscleGain.fatGram, 44);

const bodyShaping = goalConfig.getMacroTargetsByGoal("塑形", 1800);
assert.strictEqual(bodyShaping.carbsGram, 203);
assert.strictEqual(bodyShaping.proteinGram, 135);
assert.strictEqual(bodyShaping.fatGram, 50);

function context(goal) {
  return coachService.buildCoachContext(
    { goal, calorieTarget: 1800 },
    {
      totalCalories: 1200,
      totalProtein: 80,
      macroTargets: { calories: 1800, protein: 130 }
    },
    { caloriesBurned: 200, completed: false },
    goal
  );
}

const lossReply = coachService.buildMockReply("定制居家哑铃训练", context("fat_loss"));
const gainReply = coachService.buildMockReply("定制居家哑铃训练", context("muscle_gain"));
const shapingReply = coachService.buildMockReply("定制居家哑铃训练", context("body_shaping"));
assert.notStrictEqual(lossReply, gainReply);
assert.notStrictEqual(gainReply, shapingReply);
assert.ok(lossReply.includes("40 秒"));
assert.ok(gainReply.includes("105 秒"));
assert.ok(shapingReply.includes("核心"));

console.log("goal system tests passed");
