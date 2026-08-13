// tests/route_policy.test.js
// 验证 agent 的 fast/deep 双路径路由策略
const assert = require("assert");
const {
  AgentIntent
} = require("../../cloudfunctions/mcloud/fitness-agent-harness/shared/types/agent_types.js");
const {
  recommendPath,
  ROUTE_POLICY,
  RESPONSE_MODE
} = require("../../cloudfunctions/mcloud/fitness-agent-harness/runtime/bootstrap/agent.config.js");

// 1. fast 路径：写操作、确认/取消、unsupported 全部走 fast
[
  AgentIntent.DIET_RECORD,
  AgentIntent.TRAINING_RECORD,
  AgentIntent.CONFIRM_WRITE,
  AgentIntent.CANCEL_WRITE,
  AgentIntent.UNSUPPORTED
].forEach(intent => {
  const r = recommendPath(intent);
  assert.strictEqual(r.path, "fast", `${intent} 应走 fast`);
  assert.strictEqual(r.responseMode, RESPONSE_MODE.SHORT_CIRCUIT);
});

// 2. deep 路径：建议、计划、分析走 deep
[
  AgentIntent.DIET_SUGGESTION,
  AgentIntent.TRAINING_PLAN_CREATE,
  AgentIntent.TRAINING_PLAN_UPDATE,
  AgentIntent.BODY_ANALYSIS
].forEach(intent => {
  const r = recommendPath(intent);
  assert.strictEqual(r.path, "deep", `${intent} 应走 deep`);
  assert.strictEqual(r.responseMode, RESPONSE_MODE.CALL_MODEL);
});

// 3. 边界：confirm_without_pending_write 走 fast
const edge = recommendPath(AgentIntent.CONFIRM_WRITE, { confirmWithoutPending: true });
assert.strictEqual(edge.path, "fast");
assert.strictEqual(edge.reason, "confirm_without_pending_write");

// 4. 路由策略完整性
assert.strictEqual(ROUTE_POLICY.fast.name, "fast");
assert.strictEqual(ROUTE_POLICY.deep.name, "deep");
assert.ok(ROUTE_POLICY.fast.intents.length + ROUTE_POLICY.deep.intents.length >= 9);

console.log("route_policy tests passed");