const { AgentIntent, ToolPermissionLevel } = require("../../shared/types/agent_types.js");
const { getToolSchema } = require("../tools/tool_schemas.js");
const guardrails = require("../guardrails/guardrails.js");

function validateUnitSlots(result) {
  const errors = [];
  const slots = result.slots || {};
  if (slots.weightJin && slots.weightKg) {
    const expected = Math.round(Number(slots.weightJin) * 0.5 * 10) / 10;
    if (Math.abs(expected - Number(slots.weightKg)) > 0.1) {
      errors.push(`斤到 kg 换算错误，期望 ${expected}kg`);
    }
  }
  if (slots.weightKg && Number(slots.weightKg) > 250 && result.intent === AgentIntent.BODY_ANALYSIS) {
    errors.push("身体体重 kg 数值异常");
  }
  return errors;
}

function validateCalories(result) {
  const errors = [];
  const items = result.pendingWrite && result.pendingWrite.data && result.pendingWrite.data.items || [];
  items.forEach((item, index) => {
    const calories = Number(item.calories);
    if (Number.isFinite(calories) && calories > 2500) {
      errors.push(`第 ${index + 1} 个食物热量过高，请核对`);
    }
  });
  return errors;
}

function validateIntentTools(result) {
  const errors = [];
  (result.toolCalls || []).forEach(call => {
    const check = guardrails.validateToolIntent(result.intent, call.name);
    if (!check.allowed) errors.push(`${call.name}: ${check.reason}`);
  });
  return errors;
}

function validateWriteSafety(result) {
  const errors = [];
  (result.toolCalls || []).forEach(call => {
    const schema = getToolSchema(call.name);
    if (!schema) return errors.push(`${call.name}: UNKNOWN_TOOL`);
    const isWrite = schema.permissionLevel === ToolPermissionLevel.WRITE ||
      schema.permissionLevel === ToolPermissionLevel.SENSITIVE_WRITE;
    if (isWrite && !result.confirmedByUser) {
      errors.push(`${call.name}: 写入工具调用必须经过用户确认`);
    }
  });
  return errors;
}

function validateToolResults(result) {
  const errors = [];
  (result.toolCalls || []).forEach(call => {
    if (call.result && call.result.ok === false) {
      errors.push(`${call.name}: ${call.result.error && call.result.error.message || "工具失败"}`);
    }
  });
  if (errors.length && /已(完成|记录|保存|写入)/.test(String(result.reply || ""))) {
    errors.push("工具失败时不能回复已完成");
  }
  return errors;
}

function validateScope(result) {
  const check = guardrails.scopeGuardrail(result.intent, result.reply);
  return check.allowed ? [] : [check.reason];
}

function runValidators(result) {
  const errors = []
    .concat(validateUnitSlots(result))
    .concat(validateCalories(result))
    .concat(validateIntentTools(result))
    .concat(validateWriteSafety(result))
    .concat(validateToolResults(result))
    .concat(validateScope(result));
  return {
    passed: errors.length === 0,
    errors
  };
}

module.exports = {
  runValidators,
  validateCalories,
  validateIntentTools,
  validateScope,
  validateToolResults,
  validateUnitSlots,
  validateWriteSafety
};
