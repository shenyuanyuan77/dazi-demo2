function clone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function getPendingProposal(messages) {
  const list = Array.isArray(messages) ? messages : [];
  for (let messageIndex = list.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = list[messageIndex];
    const proposals = message && message.AI_MESSAGE_PAYLOAD
      ? (message.AI_MESSAGE_PAYLOAD.proposals || [])
      : [];
    for (let proposalIndex = proposals.length - 1; proposalIndex >= 0; proposalIndex -= 1) {
      const proposal = proposals[proposalIndex];
      if (!proposal || proposal.status !== "pending") continue;
      return {
        messageIndex,
        proposalIndex,
        message,
        proposal: clone(proposal)
      };
    }
  }
  return null;
}

function buildUnsupportedReply() {
  return [
    "我现在只处理这六类任务：饮食记录、饮食建议、训练计划制定、训练记录、计划修改、身体分析。",
    "你可以这样问：",
    "1. 帮我记录午餐：米饭、鸡胸肉和青菜。",
    "2. 生成今日饮食建议。",
    "3. 安排 30 分钟居家训练。",
    "4. 记录今天做了深蹲 4 组，每组 12 次。",
    "5. 把刚才训练计划改成 6 组。",
    "6. 帮我分析 180cm 80kg 的身体状态。"
  ].join("\n");
}

function buildPatchAcknowledgement(result) {
  return String(result && result.message || "我已经按你的要求更新了这张待确认草稿，你可以继续检查后再保存。");
}

module.exports = {
  buildPatchAcknowledgement,
  buildUnsupportedReply,
  getPendingProposal
};
