const { AgentIntent, ToolPermissionLevel } = require("../../shared/types/agent_types.js");
const { SUPPORTED_CAPABILITIES } = require("../bootstrap/agent.config.js");
const { getToolSchema } = require("../tools/tool_schemas.js");

function unsupportedReply() {
  return `这个问题不在当前健康管理 agent 的支持范围内。我现在只支持：${SUPPORTED_CAPABILITIES.join("、")}。你可以问：今天吃了什么怎么记录、今天还能吃多少热量、帮我安排训练、帮我分析体重或体脂。`;
}

function inputGuardrail(message) {
  const text = String(message || "").trim();
  if (!text) {
    return { allowed: false, reason: "EMPTY_INPUT", reply: "请先输入要记录或咨询的内容。" };
  }
  if (text.length > 1200) {
    return { allowed: false, reason: "INPUT_TOO_LONG", reply: "这条内容太长了，请拆成更短的健康记录或问题。" };
  }
  return { allowed: true };
}

function validateToolIntent(intent, toolName) {
  const schema = getToolSchema(toolName);
  if (!schema) return { allowed: false, reason: "UNKNOWN_TOOL" };
  if (intent === AgentIntent.TRAINING_RECORD && /^diet\./.test(toolName)) {
    return { allowed: false, reason: "TRAINING_CANNOT_CALL_DIET_TOOL" };
  }
  if (intent === AgentIntent.DIET_RECORD && /^training\./.test(toolName)) {
    return { allowed: false, reason: "DIET_CANNOT_CALL_TRAINING_TOOL" };
  }
  return { allowed: true };
}

function validateWriteToolCall(toolCall, confirmedByUser) {
  const schema = getToolSchema(toolCall && toolCall.name);
  if (!schema) return { allowed: false, reason: "UNKNOWN_TOOL" };
  const isWrite = schema.permissionLevel === ToolPermissionLevel.WRITE ||
    schema.permissionLevel === ToolPermissionLevel.SENSITIVE_WRITE;
  if (isWrite && !confirmedByUser) {
    return { allowed: false, reason: "WRITE_REQUIRES_CONFIRMATION" };
  }
  return { allowed: true };
}

function scopeGuardrail(intent, reply) {
  if (intent !== AgentIntent.UNSUPPORTED) return { allowed: true };
  const text = String(reply || "");
  if (/(论文|代码|旅游|股市).{0,80}(首先|可以|建议你|步骤)/.test(text)) {
    return { allowed: false, reason: "UNSUPPORTED_ANSWER_EXPANDED" };
  }
  return { allowed: true };
}

module.exports = {
  inputGuardrail,
  scopeGuardrail,
  unsupportedReply,
  validateToolIntent,
  validateWriteToolCall
};
