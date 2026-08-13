const assert = require("assert");
const { AgentIntent, PendingWriteStatus } = require("../shared/types/agent_types.js");
const Adapter = require("../runtime/parser/miniprogram_adapter.js");

function baseTurn(patch) {
  return Object.assign({
    reply: "我已生成训练计划草稿，请确认后再保存。",
    intent: AgentIntent.TRAINING_PLAN_CREATE,
    slots: {},
    toolCalls: [],
    memoryUpdates: [],
    guardrailResult: { allowed: true },
    validationResult: { passed: true, errors: [] },
    confirmedByUser: false,
    contextUsed: { keys: [], data: {} },
    trace: [],
    responseMode: "call_model"
  }, patch || {});
}

function pendingTrainingPlan() {
  return {
    id: "pending-1",
    type: "training_plan",
    target: "trainingPlans",
    data: {
      date: "2026-07-03",
      exercises: [{ name: "深蹲", sets: [{ reps: "12" }] }]
    },
    summaryForUser: "训练计划",
    status: PendingWriteStatus.WAITING_CONFIRM,
    createdAt: "2026-07-03T08:00:00.000Z",
    expiresAt: "2026-07-03T08:30:00.000Z"
  };
}

const pendingResult = baseTurn({ pendingWrite: pendingTrainingPlan() });
const unsafeWriteAnswer = Adapter.mergeModelAnswer({
  type: "training",
  title: "训练计划",
  content: "已保存到你的训练计划。明天开始练。",
  payload: {},
  safety: {}
}, pendingResult);

assert.ok(!/已保存|保存成功|已写入|已记录/.test(unsafeWriteAnswer.content));
assert.match(unsafeWriteAnswer.content, /确认|核对|保存/);
assert.deepStrictEqual(
  unsafeWriteAnswer.payload.answerContract.violations.includes("PREMATURE_WRITE_CLAIM"),
  true
);
assert.deepStrictEqual(
  unsafeWriteAnswer.payload.answerContract.passed,
  false
);

const missingConfirmAnswer = Adapter.mergeModelAnswer({
  type: "training",
  title: "训练计划",
  content: "这是一份适合你的训练安排。",
  payload: {},
  safety: {}
}, pendingResult);
assert.match(missingConfirmAnswer.content, /待确认|确认保存/);
assert.ok(missingConfirmAnswer.payload.answerContract.violations.includes("MISSING_CONFIRMATION_PROMPT"));

const unsupportedAnswer = Adapter.mergeModelAnswer({
  type: "general",
  title: "论文",
  content: "论文第一步先写研究背景，第二步展开论证。",
  payload: {},
  safety: {}
}, baseTurn({
  intent: AgentIntent.UNSUPPORTED,
  reply: "这个问题不在当前健康管理 agent 的支持范围内。",
  responseMode: "short_circuit"
}));
assert.match(unsupportedAnswer.content, /只支持/);
assert.ok(!/论文第一步|第二步/.test(unsupportedAnswer.content));
assert.ok(unsupportedAnswer.payload.answerContract.violations.includes("UNSUPPORTED_SCOPE_EXPANSION"));

const noPendingWriteClaim = Adapter.mergeModelAnswer({
  type: "diet",
  title: "饮食建议",
  content: "已记录你的饮食。建议晚餐清淡。",
  payload: {},
  safety: {}
}, baseTurn({
  intent: AgentIntent.DIET_SUGGESTION,
  reply: "按已有记录估算，今天剩余约 1200 kcal。",
  responseMode: "call_model"
}));
assert.ok(!/已记录/.test(noPendingWriteClaim.content));
assert.ok(noPendingWriteClaim.payload.answerContract.violations.includes("UNCONFIRMED_WRITE_CLAIM"));

console.log("Adapter answer contract tests passed");
