// cloudfunctions/mcloud/project/dazi/data/index.js
// 官方数据统一入口，方便 agent / biz / 前端按需取用
// 所有数据均带版本号与来源，使用时务必在回答中标注。

const dietGuidelines = require('./diet_guidelines.js');
const activityGuidelines = require('./activity_guidelines.js');
const foodComposition = require('./food_composition.js');
const knowledge = require('./knowledge/loader.js');
const retrieval = require('./knowledge/retrieval.js');

module.exports = {
  dietGuidelines,
  activityGuidelines,
  foodComposition,
  knowledge,
  retrieval,
  /**
   * 拼装一段系统级"硬约束"上下文，注入到 LLM system prompt 的尾部。
   * 该段内容短小但权威，强制模型使用其中的数值与措辞。
   */
  buildOfficialConstraintsPrompt() {
    return [
      '【以下为必须遵守的官方约束，模型不得编造数值】',
      '',
      dietGuidelines.toPromptContext(),
      '',
      activityGuidelines.toPromptContext(),
      '',
      foodComposition.toPromptContext(),
      '',
      '【来源标注规则】',
      '回答中涉及官方推荐量或食物营养数据时，必须在尾部追加来源（格式：[来源: 中国居民膳食指南2022 / 中国食物成分表6.0 / 中国成人身体活动指南2021]），不得省略。'
    ].join('\n');
  },
  /**
   * 用 RAG 检索增强：根据用户问题找出最相关的 5 条知识条目，
   * 并格式化为可直接拼到 prompt 末尾的"参考上下文"。
   * 检索驱动可切换：默认 local-tfidf，可换 RAGFlow。
   */
  async buildRagContext(query, options) {
    const driver = retrieval.createDriver(options || {});
    const hits = await driver.search(query, (options && options.topK) || 5);
    if (!hits.length) return { context: "", hits: [] };
    const context = [
      '【RAG 参考】以下条目来自官方权威知识库，回答中可引用，引用须标注来源。',
      '',
      retrieval.formatContext(hits),
      '【引用规则】若 RAG 内容与 system prompt 中的硬约束冲突，以硬约束为准。'
    ].join('\n');
    return { context, hits };
  },
  /**
   * 数据清单（用于审计/版本展示）
   */
  manifest() {
    return [
      { key: 'diet_guidelines',       version: dietGuidelines.VERSION,       source: dietGuidelines.SOURCE,     updated: dietGuidelines.LAST_UPDATED },
      { key: 'activity_guidelines',   version: activityGuidelines.VERSION,   source: activityGuidelines.SOURCE_ADULT, updated: activityGuidelines.LAST_UPDATED },
      { key: 'food_composition',      version: foodComposition.VERSION,      source: foodComposition.SOURCE,    updated: foodComposition.LAST_UPDATED, count: foodComposition.items.length },
      { key: 'rag_knowledge',         version: knowledge.VERSION,            source: knowledge.SOURCES.join(' / '), updated: knowledge.LAST_UPDATED, count: knowledge.loadAll().length }
    ];
  }
};