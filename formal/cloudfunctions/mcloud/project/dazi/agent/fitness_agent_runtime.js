const FitnessCoachPrompt = require("./fitness_coach_prompt.js");
const FitnessCoachSkill = require("./fitness_coach_skill.js");
const officialData = require("../data/index.js");

const FAST_MODEL = "mimo-v2-flash";
const MULTI_MODEL = "mimo-v2.5";

const SYSTEM_TAIL_INJECTION = officialData.buildOfficialConstraintsPrompt();

/**
 * 选择模型：含图片 -> 多模态，否则快速文本。
 */
function pickModel(input) {
  const images = (input && (input.images || input.imageData)) || [];
  return images && images.length ? MULTI_MODEL : FAST_MODEL;
}

/**
 * 在 system prompt 末尾追加官方硬约束 + RAG 检索结果。
 * - 输入：input.userText 或 input.message 用于 RAG 查询
 * - 可在 opts.useRag=false 时关闭
 * - 可在 opts.driver='ragflow' 时切到远程 RAGFlow 驱动
 *
 * [方案A 改动] 此函数已从 dead code 激活, 被 buildConversationMessages 真正调用。
 */
async function injectOfficialContext(messages, opts) {
  const options = opts || {};
  // 取 query: 优先 opts.query, 否则取最后一条 user 消息的文本
  let query = options.query || "";
  if (!query && Array.isArray(messages)) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const c = messages[i].content;
      if (messages[i].role === "user" && typeof c === "string") { query = c; break; }
      if (messages[i].role === "user" && Array.isArray(c)) {
        const t = c.find(x => x.type === "text");
        if (t) { query = t.text; break; }
      }
    }
  }

  let ragBlock = "";
  let ragSources = [];
  if (options.useRag !== false && query) {
    try {
      const result = await officialData.buildRagContext(String(query), {
        driver: options.driver,
        topK: options.topK || 5,
        ...(options.ragOptions || {})
      });
      ragBlock = result.context || "";
      // 提取来源名 (用于回答标注)
      if (Array.isArray(result.hits)) {
        const seen = new Set();
        for (const hit of result.hits) {
          const src = hit && hit.chunk && hit.chunk.source;
          if (src && !seen.has(src)) { seen.add(src); ragSources.push(src); }
        }
      }
    } catch (err) {
      // RAG 失败时降级为仅硬约束
      ragBlock = "（RAG 检索暂不可用，回答时仅依赖硬约束与内置知识）";
    }
  }
  const tail = [SYSTEM_TAIL_INJECTION, ragBlock].filter(Boolean).join("\n\n");
  const next = Array.isArray(messages) ? messages.slice() : [];
  if (next.length && next[0] && next[0].role === "system") {
    next[0] = Object.assign({}, next[0], {
      content: String(next[0].content || "") + "\n\n" + tail
    });
  } else {
    next.unshift({ role: "system", content: tail });
  }
  return { messages: next, ragSources, ragAugmented: Boolean(ragBlock) };
}

/**
 * [方案A 新增] 给模型回答追加来源标注。
 * 如果回答已含 [来源: 则不重复加; 否则追加 ragSources 前 3 个。
 */
function addSourceCitation(reply, sources) {
  const text = String(reply || "");
  if (!sources || !sources.length) return text;
  if (/\[来源[：:]/.test(text)) return text; // 已含标注
  const top = sources.slice(0, 3).join(" / ");
  return text.replace(/\s*$/, "") + "\n\n[来源: " + top + "]";
}

function hasImages(input = {}) {
  return Boolean(input.images && input.images.length);
}

function selectModel(input = {}, config = {}) {
  return hasImages(input) ? config.MIMO_MODEL : config.MIMO_FAST_MODEL;
}

function isDetailedPlanRequest(message) {
  return /(训练|计划|练胸|练背|练腿|练肩|练手臂|减脂|增肌).*(详细|具体|补充|完整|动作|\d+\s*个)|(?:详细|具体|补充|完整|改成|我要).*(?:计划|训练|动作)/.test(
    String(message || "")
  );
}

function buildDetailedPlanInstruction(message) {
  const countMatch = String(message || "").match(/(\d+)\s*个动作/);
  const countRule = countMatch
    ? `The user explicitly requested ${countMatch[1]} exercises. Return exactly ${countMatch[1]} distinct exercises.`
    : "Return 5-7 distinct exercises unless the user specified another count.";
  return `
This is a detailed workout-plan request or a follow-up modifying the current plan.
${countRule}
You MUST:
- answer the latest request by extending or modifying the plan in conversation history;
- list every exercise by a concrete Chinese name;
- include sets, reps or duration, rest time, and one short technique cue for every exercise;
- put the same complete exercises into payload.days and one pending workoutPlan proposal;
- never answer with a generic summary such as "计划包含N个动作" without naming them.
Keep names Chinese-only in the structured proposal. Do not repeat the previous generic answer.
`.trim();
}

function buildMultimodalContent(text, images) {
  const safeImages = Array.isArray(images) ? images.filter(Boolean).slice(0, 3) : [];
  if (!safeImages.length) return text;
  return safeImages.map(url => ({
    type: "image_url",
    image_url: { url }
  })).concat({
    type: "text",
    text: text || "请分析这些图片，并结合健身、训练或饮食场景给出建议。"
  });
}

function buildProposalContext(payload) {
  const proposals = payload && Array.isArray(payload.proposals)
    ? payload.proposals.slice(0, 3)
    : [];
  if (!proposals.length) return "";
  return `\n\n[STRUCTURED_PROPOSALS]\n${JSON.stringify(proposals)}`;
}

function buildConversationMessages(input = {}) {
  const detailedPlan = !hasImages(input) && isDetailedPlanRequest(input.message);
  const messages = [{
    role: "system",
    content: `${FitnessCoachPrompt.build(input)}\n\nRUNTIME ROUTE:\n${JSON.stringify(input.intent || {})}`
  }];

  messages.push({
    role: "system",
    content: FitnessCoachSkill.buildSkillContext()
  });

  messages.push({
    role: "system",
    content: `${FitnessCoachSkill.buildContextSummary(input)}\n\n[FOLLOW_UP_POLICY]\n${FitnessCoachSkill.buildClarificationHint(input)}`
  });

  if (detailedPlan) {
    messages.push({
      role: "system",
      content: buildDetailedPlanInstruction(input.message)
    });
  }

  for (const item of input.history || []) {
    const role = item.AI_MESSAGE_ROLE === "assistant" ? "assistant" : "user";
    const content = String(item.AI_MESSAGE_CONTENT || "").trim();
    const images = item.resolvedImages || [];
    if (!content && !images.length) continue;
    messages.push({
      role,
      content: role === "user"
        ? buildMultimodalContent(content, images)
        : `${content}${buildProposalContext(item.AI_MESSAGE_PAYLOAD)}`
    });
  }

  messages.push({
    role: "user",
    content: buildMultimodalContent(input.message, input.images || [])
  });

  return {
    detailedPlan,
    messages
  };
}

module.exports = {
  FAST_MODEL,
  MULTI_MODEL,
  buildConversationMessages,
  buildDetailedPlanInstruction,
  buildMultimodalContent,
  buildProposalContext,
  hasImages,
  isDetailedPlanRequest,
  selectModel,
  pickModel,
  injectOfficialContext,
  addSourceCitation
};
