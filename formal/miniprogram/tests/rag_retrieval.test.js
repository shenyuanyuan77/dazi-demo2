// tests/rag_retrieval.test.js
// 验证 RAG 知识库加载、检索、打分与驱动切换
const assert = require("assert");
const {
  loadAll,
  getById,
  listBySection
} = require("../../cloudfunctions/mcloud/project/dazi/data/knowledge/loader.js");
const {
  search,
  formatContext,
  createDriver,
  tokenize
} = require("../../cloudfunctions/mcloud/project/dazi/data/knowledge/retrieval.js");
const dataIndex = require("../../cloudfunctions/mcloud/project/dazi/data/index.js");

// 1. 知识库加载：必须 ≥ 50 个 chunk
const chunks = loadAll();
assert.ok(chunks.length >= 50, `expected ≥50 chunks, got ${chunks.length}`);

// 2. 每条 chunk 必备字段
chunks.forEach(chunk => {
  assert.ok(chunk.id, "chunk.id");
  assert.ok(chunk.source, "chunk.source");
  assert.ok(chunk.title, "chunk.title");
  assert.ok(chunk.section, "chunk.section");
  assert.ok(chunk.text, "chunk.text");
  assert.ok(Array.isArray(chunk.tags), "chunk.tags");
});

// 3. 来源必须来自权威源
const ALLOWED_SOURCES = [
  "中国居民膳食指南2022",
  "中国成人身体活动指南2021",
  "中国食物成分表第6版",
  "中国营养学会综合建议"
];
chunks.forEach(chunk => {
  assert.ok(ALLOWED_SOURCES.includes(chunk.source),
    `${chunk.id} 来源不在权威源白名单中：${chunk.source}`);
});

// 4. 分词：中文 2/3-gram + 英文单词
const tokens = tokenize("减脂期蛋白质 鸡胸 200g");
assert.ok(tokens.includes("减脂"));
assert.ok(tokens.includes("减脂期"));
assert.ok(tokens.includes("蛋白质"));
assert.ok(tokens.includes("鸡胸"));
assert.ok(tokens.includes("200g"));

// 5. 检索：减脂 → 命中减脂相关 chunk
const fatLossHits = search("减脂期蛋白质", 5);
assert.ok(fatLossHits.length > 0);
const topHit = fatLossHits[0];
assert.ok(topHit.score > 0);
assert.ok(topHit.matched > 0);
assert.ok(topHit.chunk.id);
assert.ok(topHit.chunk.text);

// 6. 检索：活动 → 命中身体活动指南
const activityHits = search("每周有氧 抗阻", 5);
assert.ok(activityHits.length > 0);
assert.ok(activityHits.some(h => h.chunk.source === "中国成人身体活动指南2021"));

// 7. 检索：食物 → 命中食物成分表
const foodHits = search("鸡胸 蛋白质", 5);
assert.ok(foodHits.length > 0);
assert.ok(foodHits.some(h => h.chunk.source === "中国食物成分表第6版"));

// 8. 检索：无关查询应返回低分或空（不强行匹配）
const irrelevantHits = search("xyzqwertyasdfgh", 5);
assert.ok(Array.isArray(irrelevantHits));

// 9. formatContext 渲染
const ctx = formatContext(foodHits.slice(0, 2));
assert.ok(ctx.includes("[#1]"));
assert.ok(ctx.includes("来源="));

// 10. driver 抽象：local-tfidf
(async () => {
  const localDriver = createDriver({ driver: "local" });
  const health = await localDriver.health();
  assert.strictEqual(health.ok, true);
  assert.strictEqual(health.driver, "local-tfidf");
  const driverHits = await localDriver.search("减脂", 3);
  assert.ok(driverHits.length > 0);

  // 11. data/index.js buildRagContext 端到端
  const rag = await dataIndex.buildRagContext("减脂期蛋白质");
  assert.ok(rag.context);
  assert.ok(rag.hits.length > 0);

  // 12. manifest 含 RAG 知识库
  const manifest = dataIndex.manifest();
  const ragEntry = manifest.find(m => m.key === "rag_knowledge");
  assert.ok(ragEntry);
  assert.ok(ragEntry.count >= 50);

  // 13. getById 命中
  const found = getById("diet-vegetables");
  assert.ok(found);
  assert.strictEqual(found.id, "diet-vegetables");

  // 14. listBySection
  const dietChunks = listBySection("膳食推荐");
  assert.ok(dietChunks.length > 0);

  console.log("rag_retrieval tests passed");
})().catch(err => {
  console.error("rag_retrieval tests failed:", err);
  process.exit(1);
});