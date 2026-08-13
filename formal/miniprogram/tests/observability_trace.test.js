// tests/observability_trace.test.js
// 验证请求追踪器 createTrace 的事件/工具/模型/错误 API
const assert = require("assert");
const {
  createTrace,
  redact
} = require("../../cloudfunctions/mcloud/fitness-agent-harness/runtime/observability/trace.js");

// 1. 基础 trace 生成 + requestId 透传
const t = createTrace({ requestId: "req-test-1", userId: "u1", sessionId: "s1" });
assert.strictEqual(t.requestId, "req-test-1");
assert.strictEqual(t.userId, "u1");

t.event("intent.recognized", { intent: "DIET_RECORD" });
t.tool("diet.analyze", { ok: true, durationMs: 12, outcome: "ok" });
t.model("mimo-v2-flash", { ok: true, durationMs: 280, tokens: 220 });
t.warning("timeout_check");
t.error("model_failed", { code: "TIMEOUT" });
t.finish({ route: "deep" });

const summary = t.render();
assert.strictEqual(summary.requestId, "req-test-1");
assert.ok(summary.events.some(e => e.phase === "intent.recognized"));
assert.ok(summary.events.some(e => e.phase === "tool.ok"));
assert.ok(summary.events.some(e => e.phase === "model.call"));
assert.ok(summary.events.some(e => e.phase === "warning"));
assert.ok(summary.events.some(e => e.phase === "error"));
assert.ok(summary.events.some(e => e.phase === "request.finish"));
assert.strictEqual(summary.counters.tools, 1);
assert.strictEqual(summary.counters.models, 1);
assert.strictEqual(summary.counters.errors, 1);

// 2. JSON 行格式
const lines = t.toJsonLines();
assert.ok(lines.length >= 6);
lines.forEach(line => {
  const obj = JSON.parse(line);
  assert.strictEqual(obj.requestId, "req-test-1");
  assert.ok(obj.phase);
});

// 3. redact 函数：对象中指定字段被 *** 替换
const redacted = redact(
  { openId: "oX", unionId: "uY", nickname: "张三", items: [{ openId: "oZ" }] },
  ["openId", "unionId"]
);
assert.strictEqual(redacted.openId, "***");
assert.strictEqual(redacted.unionId, "***");
assert.strictEqual(redacted.nickname, "张三");
assert.strictEqual(redacted.items[0].openId, "***");

// 4. 不存在的敏感字段列表应原样返回
const safe = redact({ nickname: "李四", phone: "123" }, []);
assert.deepStrictEqual(safe, { nickname: "李四", phone: "123" });

console.log("observability_trace tests passed");