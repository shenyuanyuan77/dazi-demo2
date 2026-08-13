function appendTurn(shortTermMemory, userMessage, assistantReply) {
  const next = Array.isArray(shortTermMemory) ? shortTermMemory.slice(-20) : [];
  if (userMessage) {
    next.push({
      role: "user",
      content: String(userMessage).slice(0, 1200),
      at: new Date().toISOString()
    });
  }
  if (assistantReply) {
    next.push({
      role: "assistant",
      content: String(assistantReply).slice(0, 1200),
      at: new Date().toISOString()
    });
  }
  return next.slice(-24);
}

module.exports = { appendTurn };
