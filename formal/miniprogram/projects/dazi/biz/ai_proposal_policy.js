function explicitNoWrite(message) {
  return /(不用|不要|无需|别).{0,4}(记录|写入|保存)|只.{0,4}(分析|看看|建议)/.test(
    String(message || "")
  );
}

function allowsProposal(intentResult) {
  return !intentResult || intentResult.responseMode === "generate_proposal";
}

function hasUsableProposal(proposals) {
  return (Array.isArray(proposals) ? proposals : []).some(proposal => {
    const data = proposal && proposal.payload || {};
    if (proposal.type === "dietLog") return Array.isArray(data.items) && data.items.length > 0;
    if (proposal.type === "workoutPlan") {
      return Array.isArray(data.exercises) && data.exercises.length > 0;
    }
    return proposal.type === "profilePatch" &&
      data.profilePatch &&
      typeof data.profilePatch === "object" &&
      Object.keys(data.profilePatch).length > 0;
  });
}

function applyProposalMode(answer, intentResult) {
  const source = answer || {};
  const payload = Object.assign({}, source.payload || {});
  if (allowsProposal(intentResult)) return source;
  return Object.assign({}, source, {
    payload: Object.assign({}, payload, {
      proposals: [],
      intent: intentResult
    })
  });
}

module.exports = {
  allowsProposal,
  applyProposalMode,
  explicitNoWrite,
  hasUsableProposal
};
