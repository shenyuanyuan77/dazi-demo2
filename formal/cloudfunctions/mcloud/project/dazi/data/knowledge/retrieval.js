// cloudfunctions/mcloud/project/dazi/data/knowledge/retrieval.js
// 检索器：内置 TF + 关键词评分；可替换为 RAGFlow 远程召回或本地向量召回。
//
// 用法：
//   const { search } = require('./retrieval.js');
//   const hits = search("减脂期蛋白质", 5);
//   // => [{ chunk, score, matchedTerms: [] }, ...]
//
// 切换驱动：
//   const { createDriver } = require('./retrieval.js');
//   const driver = createDriver({ driver: 'ragflow', baseUrl: '...', apiKey: '...' });
//   const hits = await driver.search('减脂期蛋白质', 5);

const { loadAll } = require("./loader.js");

/**
 * 简单分词：中文按字符 n-gram（2-3 字）+ 英文按空格。
 * 适合小数据集（< 1000 chunks）；不需要引入分词库。
 */
function tokenize(text) {
  if (!text) return [];
  const raw = String(text).toLowerCase();
  const tokens = new Set();
  // 英文/数字
  raw.split(/[\s,;.!?，。！？；：、（）()【】\[\]"'`]+/).forEach(w => {
    if (w && w.length > 1) tokens.add(w);
  });
  // 中文 2-gram
  const cn = raw.replace(/[^\u4e00-\u9fa5]/g, "");
  for (let i = 0; i < cn.length - 1; i++) {
    const g2 = cn.substr(i, 2);
    if (g2.length === 2) tokens.add(g2);
  }
  // 中文 3-gram（重要词如 "减脂期"）
  for (let i = 0; i < cn.length - 2; i++) {
    const g3 = cn.substr(i, 3);
    if (g3.length === 3) tokens.add(g3);
  }
  return Array.from(tokens);
}

function buildTf(tokens) {
  const tf = Object.create(null);
  tokens.forEach(t => { tf[t] = (tf[t] || 0) + 1; });
  return tf;
}

/**
 * 计算每个 chunk 的 TF-IDF 分数。
 * chunks 已预 tokenize；queryTokens 即查询词。
 */
function scoreChunk(chunk, queryTf, idf) {
  const chunkTf = chunk._tf;
  let score = 0;
  let matched = 0;
  Object.keys(queryTf).forEach(term => {
    const cf = chunkTf[term] || 0;
    if (cf > 0) {
      score += cf * (idf[term] || 1);
      matched += 1;
    }
  });
  // 标签完全命中加权
  (chunk.tags || []).forEach(tag => {
    const tagTokens = tokenize(tag);
    tagTokens.forEach(t => {
      if (queryTf[t]) score += 1.5;
    });
  });
  // 标题命中加权
  const titleTokens = tokenize(chunk.title || "");
  titleTokens.forEach(t => {
    if (queryTf[t]) score += 2.0;
  });
  return { score, matched };
}

function buildIdf(chunks) {
  const df = Object.create(null);
  chunks.forEach(chunk => {
    const seen = new Set(Object.keys(chunk._tf));
    seen.forEach(t => { df[t] = (df[t] || 0) + 1; });
  });
  const total = chunks.length;
  const idf = Object.create(null);
  Object.keys(df).forEach(t => {
    idf[t] = Math.log(1 + total / df[t]);
  });
  return idf;
}

/**
 * 索引（懒加载），把每个 chunk 的 tokens 缓存。
 */
let _cache = null;
function getIndex() {
  if (_cache) return _cache;
  const chunks = loadAll();
  chunks.forEach(chunk => {
    const tokens = tokenize(chunk.text + " " + (chunk.title || "") + " " + (chunk.tags || []).join(" "));
    chunk._tf = buildTf(tokens);
  });
  const idf = buildIdf(chunks);
  _cache = { chunks, idf };
  return _cache;
}

/**
 * 本地 TF-IDF 检索。
 * @param {string} query
 * @param {number} topK
 */
function search(query, topK = 5) {
  const index = getIndex();
  const qTokens = tokenize(query);
  const qTf = buildTf(qTokens);
  const hits = index.chunks.map(chunk => {
    const { score, matched } = scoreChunk(chunk, qTf, index.idf);
    return {
      chunk: stripInternal(chunk),
      score: Number(score.toFixed(4)),
      matched
    };
  })
    .filter(hit => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  return hits;
}

function stripInternal(chunk) {
  const out = Object.assign({}, chunk);
  delete out._tf;
  return out;
}

/**
 * 把检索结果格式化为模型可读的"上下文片段"。
 */
function formatContext(hits) {
  if (!hits || !hits.length) return "";
  return hits.map((hit, idx) => {
    const c = hit.chunk;
    return [
      `[#${idx + 1}] 来源=${c.source} · 章节=${c.section} · 标题=${c.title}`,
      c.text,
      ""
    ].join("\n");
  }).join("\n");
}

/**
 * 构造驱动接口：driver = "local" | "ragflow"
 * RAGFlow 驱动走 HTTP /v1/retrieval/recall，需要 baseUrl + apiKey + datasetIds。
 */
function createDriver(options) {
  const opts = options || {};
  const driver = opts.driver || "local";

  if (driver === "local") {
    return {
      name: "local-tfidf",
      async search(query, topK) {
        return search(query, topK);
      },
      async health() {
        const idx = getIndex();
        return { ok: true, chunks: idx.chunks.length, driver: "local-tfidf" };
      }
    };
  }

  if (driver === "ragflow") {
    const baseUrl = opts.baseUrl || process.env.RAGFLOW_BASE_URL || "";
    const apiKey = opts.apiKey || process.env.RAGFLOW_API_KEY || "";
    const datasetIds = opts.datasetIds || (process.env.RAGFLOW_KB_DIET
      ? [process.env.RAGFLOW_KB_DIET, process.env.RAGFLOW_KB_TRAINING, process.env.RAGFLOW_KB_FAQ].filter(Boolean)
      : []);
    if (!baseUrl || !apiKey) {
      throw new Error("ragflow driver requires baseUrl + apiKey");
    }
    return {
      name: "ragflow",
      async search(query, topK = 5) {
        const resp = await fetch(`${baseUrl}/api/v1/retrieval/recall`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ question: query, dataset_ids: datasetIds, top_k: topK })
        });
        if (!resp.ok) {
          throw new Error(`ragflow recall failed: ${resp.status}`);
        }
        const data = await resp.json();
        return (data.data || []).map(item => ({
          chunk: {
            id: item.id || `ragflow-${Date.now()}-${Math.random()}`,
            source: item.dataset_name || "RAGFlow",
            title: item.title || "",
            section: item.section || "",
            text: item.content || item.text || "",
            tags: item.keywords || []
          },
          score: item.score || 0
        }));
      },
      async health() {
        return { ok: true, chunks: null, driver: "ragflow", baseUrl };
      }
    };
  }

  throw new Error(`unknown retrieval driver: ${driver}`);
}

module.exports = {
  search,
  formatContext,
  createDriver,
  tokenize,
  // 测试用
  _internal: { getIndex }
};