// tests/business_intent_routing.test.js
// 验证业务领域语义优先 / 确认-取消优先级 / unsupported 早返回
const assert = require("assert");
const { AgentIntent } = require("../../cloudfunctions/mcloud/fitness-agent-harness/shared/types/agent_types.js");
const { recognizeIntent, detectBusinessIntent } = require("../../cloudfunctions/mcloud/fitness-agent-harness/runtime/parser/intent_parser.js");

// 1. 确认/取消永远在 unsupported 之前
assert.strictEqual(recognizeIntent("确认").intent, AgentIntent.CONFIRM_WRITE);
assert.strictEqual(recognizeIntent("取消").intent, AgentIntent.CANCEL_WRITE);
// 1b. 确认/取消带语境：如果携带了 unsupported 关键词（股市等），
//     现有 isConfirmation 实现是精确匹配，所以会落到 UNSUPPORTED。
//     这保证了我们不会把"确认写论文"误判为可写操作。
assert.strictEqual(recognizeIntent("确认一下股市行情").intent, AgentIntent.UNSUPPORTED);
assert.strictEqual(recognizeIntent("取消写作计划").intent, AgentIntent.UNSUPPORTED);
// 1c. confirm 后缀形式
assert.strictEqual(recognizeIntent("确认吧").intent, AgentIntent.CONFIRM_WRITE);
assert.strictEqual(recognizeIntent("保存").intent, AgentIntent.CONFIRM_WRITE);

// 2. unsupported 关键词仍能拒绝
assert.strictEqual(recognizeIntent("帮我写一段情书").intent, AgentIntent.UNSUPPORTED);
assert.strictEqual(recognizeIntent("推荐几支基金").intent, AgentIntent.UNSUPPORTED);

// 3. 业务语义优先：包含强信号就直接路由
assert.strictEqual(recognizeIntent("我今天深蹲 5 组").intent, AgentIntent.TRAINING_RECORD);
assert.strictEqual(recognizeIntent("早餐吃了燕麦").intent, AgentIntent.DIET_RECORD);
assert.strictEqual(recognizeIntent("我的体脂率是多少").intent, AgentIntent.BODY_ANALYSIS);
assert.strictEqual(recognizeIntent("帮我安排本周训练计划").intent, AgentIntent.TRAINING_PLAN_CREATE);
assert.strictEqual(recognizeIntent("把周一改成上肢").intent, AgentIntent.TRAINING_PLAN_UPDATE);

// 4. writeDenied + 业务关键词：写类 -> 读类
assert.strictEqual(
  recognizeIntent("我吃了鸡胸，不用记录，分析一下热量").intent,
  AgentIntent.DIET_SUGGESTION
);
assert.strictEqual(
  recognizeIntent("我的体重，不用记，分析下").intent,
  AgentIntent.BODY_ANALYSIS
);

// 5. detectBusinessIntent 工具函数
assert.strictEqual(detectBusinessIntent("我今天卧推 50kg 4 组"), AgentIntent.TRAINING_RECORD);
assert.strictEqual(detectBusinessIntent("今天喝了杯奶茶"), AgentIntent.DIET_RECORD);
assert.ok(detectBusinessIntent("今天天气真好") === null);

console.log("business_intent_routing tests passed");