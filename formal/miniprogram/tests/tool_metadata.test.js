// tests/tool_metadata.test.js
// 验证工具注册表元数据：权限、超时、幂等、敏感字段、category、来源标注
const assert = require("assert");
const {
  TOOL_SCHEMAS,
  getToolSchema,
  isWriteTool,
  isReadTool,
  requiresSource,
  getCategory,
  listToolsByCategory,
  listToolSchemas
} = require("../../cloudfunctions/mcloud/fitness-agent-harness/runtime/tools/tool_schemas.js");

// 1. 全部 schema 必备字段
listToolSchemas().forEach(schema => {
  assert.ok(schema.name, `${schema.name} 必须有 name`);
  assert.ok(schema.permissionLevel, `${schema.name} 必须有 permissionLevel`);
  assert.ok(schema.category, `${schema.name} 必须有 category`);
  assert.ok(schema.i18nLabel, `${schema.name} 必须有 i18nLabel`);
  assert.ok(typeof schema.timeoutMs === "number", `${schema.name} 必须有 timeoutMs`);
  assert.ok(typeof schema.idempotent === "boolean", `${schema.name} 必须有 idempotent`);
  assert.ok(Array.isArray(schema.sensitiveFields), `${schema.name} 必须有 sensitiveFields[]`);
  assert.ok(typeof schema.sourceRequired === "boolean", `${schema.name} 必须有 sourceRequired`);
});

// 2. 写工具一律 requiresConfirmation=true + 非幂等 + 有超时
["diet.log.create", "training.plan.create", "training.log.create",
 "body.metric.create", "user.profile.update", "wechat.profile.sync"].forEach(name => {
  const schema = getToolSchema(name);
  assert.strictEqual(schema.requiresConfirmation, true, `${name} 写操作必须要求确认`);
  assert.ok(!schema.idempotent || name === "wechat.profile.sync",
    `${name} 非幂等；除微信资料同步外都应为 false`);
  assert.ok(schema.timeoutMs >= 1500);
});

// 3. 读写分类与 category
assert.strictEqual(getCategory("diet.log.create"), "diet");
assert.strictEqual(getCategory("vision.food.recognize"), "vision");
assert.strictEqual(getCategory("body.metric.create"), "body");
assert.ok(isWriteTool("diet.log.create"));
assert.ok(isReadTool("diet.log.query"));
assert.ok(!isReadTool("diet.log.create"));

// 4. 食物/营养相关工具均需标注 sourceRequired
assert.ok(requiresSource("diet.analyze"));
assert.ok(requiresSource("body.analyze"));
assert.ok(requiresSource("training.plan.create"));
assert.ok(!requiresSource("diet.log.query"));
assert.ok(!requiresSource("body.metric.query"));

// 5. category 分组工具数合理
assert.ok(listToolsByCategory("diet").length >= 3);
assert.ok(listToolsByCategory("training").length >= 4);
assert.ok(listToolsByCategory("body").length >= 2);
assert.ok(listToolsByCategory("vision").length === 2);
assert.ok(listToolsByCategory("wechat").length === 2);

// 6. 敏感字段（openId、unionId、昵称）必须在 wechat.* 的脱敏列表里
const wechatLogin = getToolSchema("wechat.login");
assert.ok(wechatLogin.sensitiveFields.includes("openId"));
const profileUpdate = getToolSchema("user.profile.update");
assert.ok(profileUpdate.sensitiveFields.includes("nickname"));

console.log("tool_metadata tests passed");