/**
 * 方案A 增强测试 — 验证 RAG 注入 + 来源标注 + LLM intent fallback 真正生效.
 *
 * 跑法: node cloudfunctions/mcloud/fitness-agent-harness/eval/test_enhancements.js
 */
const assert = require("assert");
const AgentRuntime = require("../../project/dazi/agent/fitness_agent_runtime.js");
const { recognizeIntent, recognizeIntentWithLLM, _parseLlmIntentJson, INTENT_ROUTER_SYSTEM } = require("../runtime/parser/intent_parser.js");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failed++; console.log(`  ❌ ${name}: ${e.message}`); }
}

async function testAsync(name, fn) {
  try { await fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failed++; console.log(`  ❌ ${name}: ${e.message}`); }
}

console.log("=== 方案A 增强: RAG 注入 ===");

testAsync("injectOfficialContext 返回 messages + ragSources", async () => {
  const msgs = [{ role: "system", content: "base" }, { role: "user", content: "减脂期蛋白质" }];
  const result = await AgentRuntime.injectOfficialContext(msgs, { useRag: true, topK: 3 });
  assert.ok(result.messages, "应有 messages");
  assert.ok(Array.isArray(result.ragSources), "应有 ragSources 数组");
  assert.strictEqual(typeof result.ragAugmented, "boolean");
  // system message 应含官方约束 (膳食指南)
  assert.ok(result.messages[0].content.includes("膳食"), "system 应含官方约束");
});

testAsync("injectOfficialContext RAG 检索到来源", async () => {
  const msgs = [{ role: "user", content: "蔬菜推荐量多少" }];
  const result = await AgentRuntime.injectOfficialContext(msgs, { useRag: true, topK: 3 });
  assert.ok(result.ragAugmented, "蔬菜查询应检索到内容");
  assert.ok(result.ragSources.length > 0, "应有来源");
  assert.ok(result.ragSources.some(s => s.includes("膳食指南") || s.includes("食物成分")), `来源=${result.ragSources}`);
});

testAsync("injectOfficialContext useRag=false 关闭检索", async () => {
  const msgs = [{ role: "user", content: "test" }];
  const result = await AgentRuntime.injectOfficialContext(msgs, { useRag: false });
  assert.strictEqual(result.ragAugmented, false);
});

testAsync("injectOfficialContext 失败降级不抛", async () => {
  const msgs = [{ role: "user", content: "量子物理不存在的话题" }];
  const result = await AgentRuntime.injectOfficialContext(msgs, { useRag: true });
  // 无命中 -> ragAugmented false, 不抛
  assert.strictEqual(result.ragAugmented, false);
});


console.log("\n=== 方案A 增强: 来源标注 ===");

test("addSourceCitation 无标注时追加", () => {
  const out = AgentRuntime.addSourceCitation("建议多吃蛋白", ["中国居民膳食指南2022"]);
  assert.ok(out.includes("[来源:"), `应含来源标注: ${out}`);
  assert.ok(out.includes("膳食指南"), `应含来源名: ${out}`);
});

test("addSourceCitation 已有标注不重复加", () => {
  const out = AgentRuntime.addSourceCitation("建议 [来源: 已有]", ["新来源"]);
  assert.ok(!out.includes("新来源"), "不应重复追加");
});

test("addSourceCitation 无来源不追加", () => {
  assert.strictEqual(AgentRuntime.addSourceCitation("回复", []), "回复");
  assert.strictEqual(AgentRuntime.addSourceCitation("回复", null), "回复");
});

test("addSourceCitation 最多3个来源", () => {
  const out = AgentRuntime.addSourceCitation("x", ["a", "b", "c", "d", "e"]);
  const matches = out.match(/\[来源:[^\]]+\]/g);
  assert.strictEqual(matches.length, 1); // 只一个 [来源: ...] 块
  assert.ok(!out.includes("d") || !out.includes("e")); // 不含第4、5个
});


console.log("\n=== 方案A 增强: LLM intent fallback ===");

test("_parseLlmIntentJson 合法 JSON", () => {
  const r = _parseLlmIntentJson('{"intent":"DIET_RECORD","confidence":0.9}');
  assert.strictEqual(r.intent, "DIET_RECORD");
  assert.strictEqual(r.confidence, 0.9);
  assert.strictEqual(r.reason, "llm_router");
});

test("_parseLlmIntentJson Markdown 包裹", () => {
  const r = _parseLlmIntentJson('```json\n{"intent":"BODY_ANALYSIS","confidence":0.85}\n```');
  assert.strictEqual(r.intent, "BODY_ANALYSIS");
});

test("_parseLlmIntentJson 带多余文本", () => {
  const r = _parseLlmIntentJson('好的结果是 {"intent":"TRAINING_RECORD","confidence":0.8} 希望有用');
  assert.strictEqual(r.intent, "TRAINING_RECORD");
});

test("_parseLlmIntentJson 非法 JSON 降级", () => {
  const r = _parseLlmIntentJson("not json");
  assert.strictEqual(r.intent, "UNSUPPORTED");
  assert.ok(r.confidence < 0.5);
});

test("_parseLlmIntentJson 拒绝 CONFIRM/CANCEL (规则领地)", () => {
  const r = _parseLlmIntentJson('{"intent":"CONFIRM_WRITE","confidence":0.99}');
  assert.strictEqual(r.intent, "UNSUPPORTED");
});

test("_parseLlmIntentJson confidence 越界 clamp", () => {
  let r = _parseLlmIntentJson('{"intent":"DIET_RECORD","confidence":1.5}');
  assert.strictEqual(r.confidence, 1.0);
  r = _parseLlmIntentJson('{"intent":"DIET_RECORD","confidence":-0.3}');
  assert.strictEqual(r.confidence, 0);
});

testAsync("recognizeIntentWithLLM 规则有把握时不调 LLM", async () => {
  let called = false;
  const caller = async () => { called = true; return '{"intent":"DIET_RECORD"}'; };
  const r = await recognizeIntentWithLLM("早餐吃了鸡蛋", { hasImages: false, pendingWrite: null }, caller);
  assert.strictEqual(called, false, "规则有把握不应调 LLM");
  assert.strictEqual(r.intent, "DIET_RECORD");
});

testAsync("recognizeIntentWithLLM 规则无把握时调 LLM", async () => {
  const caller = async () => '{"intent":"DIET_SUGGESTION","confidence":0.85}';
  const r = await recognizeIntentWithLLM("今天馋炸鸡又怕胖", { hasImages: false, pendingWrite: null }, caller);
  assert.strictEqual(r.intent, "DIET_SUGGESTION");
  assert.strictEqual(r.reason, "llm_router");
});

testAsync("recognizeIntentWithLLM LLM 失败降级回规则", async () => {
  const caller = async () => { throw new Error("network"); };
  const r = await recognizeIntentWithLLM("今天馋炸鸡又怕胖", { hasImages: false, pendingWrite: null }, caller);
  // 降级到规则兜底 (UNSUPPORTED)
  assert.strictEqual(r.intent, "UNSUPPORTED");
});

testAsync("recognizeIntentWithLLM 无 caller 不调 LLM", async () => {
  const r = await recognizeIntentWithLLM("今天馋炸鸡", { hasImages: false }, null);
  assert.ok(r.intent, "应有结果");
});

test("INTENT_ROUTER_SYSTEM 含意图列表", () => {
  assert.ok(INTENT_ROUTER_SYSTEM.includes("DIET_RECORD"));
  assert.ok(INTENT_ROUTER_SYSTEM.includes("UNSUPPORTED"));
  assert.ok(INTENT_ROUTER_SYSTEM.includes("输出格式"));
});


// 汇总
setTimeout(() => {
  console.log(`\n=== 方案A 增强: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}, 100);
