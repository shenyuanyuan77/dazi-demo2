const { SUPPORTED_CAPABILITIES } = require("../bootstrap/agent.config.js");
const { listToolSchemas } = require("../tools/tool_schemas.js");
// 官方数据: 兼容两种部署布局
//   - 云函数打包: mcloud/{fitness-agent-harness,project}/...  => ../../../project/...
//   - 仓库本地:   同上, 但路径分隔可能被 require 解析差异打破, 用 try-catch 兜底
let officialData;
try {
	officialData = require("../../../project/dazi/data/index.js");
} catch (_e) {
	try {
		officialData = require("../../../../project/dazi/data/index.js");
	} catch (_e2) {
		officialData = { buildOfficialConstraintsPrompt: () => "", buildRagContext: async () => ({ context: "", hits: [] }) };
	}
}

function buildSystemPrompt(context) {
  return [
    "你是健身饮食小程序中的健康管理 agent。",
    "",
    "你只支持：",
    ...SUPPORTED_CAPABILITIES.map((item, index) => `${index + 1}. ${item}`),
    "",
    "涉及写入用户数据时，必须先生成待确认写入项，并向用户确认。",
    "用户确认后，才可以调用写入工具。",
    "不能编造用户身体数据、饮食记录、训练记录。",
    "缺少必要信息时，应追问。",
    "不支持的问题，应返回支持范围和建议问法。",
    "",
    officialData.buildOfficialConstraintsPrompt(),
    "",
    "当前上下文：",
    JSON.stringify(context && context.data || {}, null, 2),
    "",
    "可用工具：",
    JSON.stringify(listToolSchemas().map(item => ({
      name: item.name,
      permissionLevel: item.permissionLevel,
      requiresConfirmation: item.requiresConfirmation,
      category: item.category,
      sourceRequired: item.sourceRequired
    })), null, 2),
    "",
    "输出必须是结构化 AgentTurnResult。"
  ].join("\n");
}

/**
 * RAG 增强：在 system prompt 之外，根据用户当前问题检索最相关的 RAG 段落，
 * 拼成可附加到 user message 或 system 末尾的"参考片段"。
 */
async function buildRagAugmentedPrompt(context, options) {
  const basePrompt = buildSystemPrompt(context);
  const opts = options || {};
  if (opts.query && opts.useRag !== false) {
    try {
      const result = await officialData.buildRagContext(opts.query, {
        driver: opts.driver,
        topK: opts.topK || 5
      });
      return basePrompt + "\n\n" + result.context;
    } catch (err) {
      return basePrompt;
    }
  }
  return basePrompt;
}

module.exports = { buildSystemPrompt, buildRagAugmentedPrompt };