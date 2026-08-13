const assert = require("assert");
const runtime = require("../../cloudfunctions/mcloud/project/dazi/agent/fitness_agent_runtime.js");

const withImage = runtime.buildConversationMessages({
  message: "帮我看看这顿饭",
  images: ["data:image/jpeg;base64,abc"],
  intent: { intent: "food_log_write", responseMode: "generate_proposal" },
  history: []
});
assert.strictEqual(withImage.detailedPlan, false);
assert.strictEqual(Array.isArray(withImage.messages), true);
assert.strictEqual(withImage.messages.at(-1).role, "user");
assert.strictEqual(Array.isArray(withImage.messages.at(-1).content), true);
assert.ok(withImage.messages[1].content.includes("[WEIGHT_LOSS_SKILL]"));
assert.ok(withImage.messages[2].content.includes("[SESSION_CONTEXT]"));

const detailed = runtime.buildConversationMessages({
  message: "给我一个详细的练腿计划，6个动作",
  images: [],
  intent: { intent: "workout_plan_generation", responseMode: "generate_proposal" },
  history: []
});
assert.strictEqual(detailed.detailedPlan, true);
assert.strictEqual(detailed.messages[3].role, "system");
assert.ok(detailed.messages[3].content.includes("exactly 6 distinct exercises"));

const onboarding = runtime.buildConversationMessages({
  message: "我想减脂，先帮我看看怎么开始",
  images: [],
  profile: {},
  intent: { intent: "meal_plan_generation", responseMode: "answer_only" },
  history: [],
  recentLogs: [],
  memory: []
});
assert.ok(onboarding.messages[2].content.includes("[FOLLOW_UP_POLICY]"));
assert.ok(onboarding.messages[2].content.includes("当前体重"));

const model = runtime.selectModel(
  { images: ["data:image/jpeg;base64,abc"] },
  { MIMO_MODEL: "vision-model", MIMO_FAST_MODEL: "text-model" }
);
assert.strictEqual(model, "vision-model");

console.log("Fitness agent runtime tests passed");
