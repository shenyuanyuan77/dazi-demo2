const assert = require("assert");

const clientFallback = require("../projects/dazi/biz/ai_response_fallback.js");
const serverFallback = require(
  "../../cloudfunctions/mcloud/project/dazi/service/ai_response_fallback.js"
);

function getProposal(answer) {
  return answer.payload && answer.payload.proposals && answer.payload.proposals[0];
}

const recognizedMeal = [
  "识别午餐内容：大碗白米饭（约350g）、烤鸡（约250g带皮）、",
  "叉烧（约100g）、豆角青菜和辣椒酱。"
].join("");

const dietAnswer = clientFallback.ensureAssistant(
  { type: "general", content: recognizedMeal, payload: {} },
  "午餐，帮我记录",
  { userProfile: { goal: "body_shaping", weight: 65 } },
  false
);
const dietProposal = getProposal(dietAnswer);
assert.strictEqual(dietAnswer.type, "diet");
assert.strictEqual(dietProposal.type, "dietLog");
assert.strictEqual(dietProposal.status, "pending");
assert.strictEqual(dietProposal.payload.meal, "lunch");
assert.ok(dietProposal.payload.items.some(item => item.name === "白米饭"));

const bodyMetricsDraft = clientFallback.ensureAssistant(
  { type: "general", content: "体重 72kg，体脂 22%，腰围 84cm。", payload: {} },
  "帮我记录今天的身体变化",
  { userProfile: { goal: "body_shaping" } },
  false,
  {
    sourceMessageId: "body-msg-1",
    intentResult: {
      intent: "body_data_recognition",
      responseMode: "generate_proposal"
    }
  }
);
assert.strictEqual(bodyMetricsDraft.type, "profile");
assert.strictEqual(getProposal(bodyMetricsDraft).type, "profilePatch");
assert.strictEqual(getProposal(bodyMetricsDraft).payload.profilePatch.weight, 72);

const noWrite = clientFallback.ensureAssistant(
  { type: "diet", content: recognizedMeal, payload: {} },
  "不用记录，只分析一下",
  { userProfile: { goal: "fat_loss" } },
  false,
  {
    intentResult: {
      intent: "food_analysis_only",
      responseMode: "analysis_only"
    }
  }
);
assert.ok(!getProposal(noWrite));

const dietPlan = clientFallback.ensureAssistant(
  { type: "general", content: "建议提高蛋白质比例。", payload: {} },
  "请根据我的目标和已有记录生成今日饮食建议",
  { userProfile: { goal: "muscle_gain", weight: 75 } },
  false,
  {
    intentResult: {
      intent: "meal_plan_generation",
      responseMode: "answer_only"
    }
  }
);
assert.ok(!getProposal(dietPlan));

const imageFallback = clientFallback.ensureAssistant(
  {
    type: "diet",
    content: "图片中是一份餐食，估算营养如下。",
    payload: { carbs: 80, protein: 35, fat: 20 }
  },
  "请识别这张图片",
  { userProfile: { goal: "fat_loss" } },
  true,
  {
    intentResult: {
      intent: "image_understanding",
      responseMode: "generate_proposal"
    }
  }
);
assert.strictEqual(getProposal(imageFallback).type, "dietLog");
assert.strictEqual(
  getProposal(imageFallback).payload.items[0].calories,
  80 * 4 + 35 * 4 + 20 * 9
);

const serverBodyAnswer = serverFallback.ensureStructuredAnswer({
  type: "general",
  content: "我看到你的体重 72kg，体脂 22%，腰围 84cm。",
  payload: {}
}, {
  message: "帮我记录今天的身体变化",
  clientMessageId: "body-msg-1",
  intent: {
    intent: "body_data_recognition",
    responseMode: "generate_proposal"
  }
});
assert.strictEqual(serverBodyAnswer.type, "profile");
assert.strictEqual(getProposal(serverBodyAnswer).type, "profilePatch");
assert.strictEqual(getProposal(serverBodyAnswer).payload.profilePatch.weight, 72);

const serverBodyAnalysisOnly = serverFallback.ensureStructuredAnswer({
  type: "general",
  content: "你的体重 72kg，体脂 22%。",
  payload: {}
}, {
  message: "分析一下我的身体数据，不要保存",
  clientMessageId: "body-msg-2",
  intent: {
    intent: "body_status_evaluation",
    responseMode: "analysis_only"
  }
});
assert.ok(!getProposal(serverBodyAnalysisOnly));

console.log("AI agent response fallback tests passed");
