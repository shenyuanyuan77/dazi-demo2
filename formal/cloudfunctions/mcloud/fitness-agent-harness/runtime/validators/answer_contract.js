const { AgentIntent, PendingWriteStatus } = require("../../shared/types/agent_types.js");
const { unsupportedReply } = require("../guardrails/guardrails.js");

const WRITE_DONE_PATTERN = /已(完成|记录|保存|写入|更新)|保存成功|记录成功|写入成功/;
const CONFIRM_PATTERN = /确认|核对|保存|写入/;
const UNSUPPORTED_EXPANSION_PATTERN = /(论文|代码如下|旅游路线|景点|买入|卖出|合同条款|开奖号码|import\s+)/i;

function hasWaitingPendingWrite(result) {
  return Boolean(
    result &&
    result.pendingWrite &&
    result.pendingWrite.status === PendingWriteStatus.WAITING_CONFIRM
  );
}

function buildConfirmationAppend(result) {
  const summary = result && result.pendingWrite && result.pendingWrite.summaryForUser;
  return summary
    ? `\n\n我已生成待确认项：${summary}。请核对后再确认保存。`
    : "\n\n我已生成待确认项。请核对后再确认保存。";
}

function removePrematureWriteClaim(content) {
  return String(content || "")
    .replace(/已(完成|记录|保存|写入|更新)[^。！？\n]*(。|！|？)?/g, "")
    .replace(/(保存|记录|写入)成功[^。！？\n]*(。|！|？)?/g, "")
    .trim();
}

function enforceAnswerContract(answer, result) {
  const violations = [];
  const next = Object.assign({}, answer || {});
  const payload = Object.assign({}, next.payload || {});
  let content = String(next.content || "").trim();

  if (result && result.intent === AgentIntent.UNSUPPORTED) {
    if (UNSUPPORTED_EXPANSION_PATTERN.test(content) || !content.includes("只支持")) {
      violations.push("UNSUPPORTED_SCOPE_EXPANSION");
      content = unsupportedReply();
    }
  }

  if (hasWaitingPendingWrite(result)) {
    if (WRITE_DONE_PATTERN.test(content)) {
      violations.push("PREMATURE_WRITE_CLAIM");
      content = removePrematureWriteClaim(content);
    }
    if (!CONFIRM_PATTERN.test(content)) {
      violations.push("MISSING_CONFIRMATION_PROMPT");
      content = `${content}${buildConfirmationAppend(result)}`.trim();
    }
  }

  if (!hasWaitingPendingWrite(result) && result && result.confirmedByUser !== true &&
      result.intent !== AgentIntent.CONFIRM_WRITE && WRITE_DONE_PATTERN.test(content)) {
    violations.push("UNCONFIRMED_WRITE_CLAIM");
    content = removePrematureWriteClaim(content);
  }

  if (!content) {
    violations.push("EMPTY_AFTER_CONTRACT_REPAIR");
    content = result && result.reply || "我需要更多信息才能继续处理。";
  }

  payload.answerContract = {
    passed: violations.length === 0,
    violations
  };
  return Object.assign({}, next, {
    content,
    payload,
    safety: Object.assign({}, next.safety || {}, {
      answerContract: payload.answerContract
    })
  });
}

module.exports = {
  enforceAnswerContract,
  removePrematureWriteClaim
};
