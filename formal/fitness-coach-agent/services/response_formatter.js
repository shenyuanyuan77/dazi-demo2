function emptyAnswer(answer, intent) {
  return {
    type: "answer",
    answer,
    payload: {
      intent: intent || { intent: "answer", domain: "general", responseMode: "answer_only" },
      proposals: []
    },
    safety: { level: "none", message: "" }
  };
}

function answerWithProposal(answer, intent, proposal) {
  const typeMap = {
    dietLog: "diet",
    workoutPlan: "training",
    profilePatch: "profile"
  };
  return {
    type: typeMap[proposal.type] || "answer",
    answer,
    payload: {
      intent,
      proposals: [proposal]
    },
    safety: { level: "none", message: "" }
  };
}

module.exports = { emptyAnswer, answerWithProposal };
