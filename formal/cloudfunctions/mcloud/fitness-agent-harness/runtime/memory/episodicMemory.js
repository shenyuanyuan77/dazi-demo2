function buildEpisodicMemory(recentLogs) {
  const logs = Array.isArray(recentLogs) ? recentLogs : [];
  return {
    dietLogs: logs
      .filter(item => item.AI_LOG_TYPE === "diet" || item.type === "diet")
      .map(item => item.AI_LOG_DATA || item.data || item)
      .slice(-20),
    trainingLogs: logs
      .filter(item => item.AI_LOG_TYPE === "exercise" || item.AI_LOG_TYPE === "training" || item.type === "training")
      .map(item => item.AI_LOG_DATA || item.data || item)
      .slice(-20),
    bodyMetrics: logs
      .filter(item => item.AI_LOG_TYPE === "body" || item.type === "body")
      .map(item => item.AI_LOG_DATA || item.data || item)
      .slice(-20)
  };
}

module.exports = { buildEpisodicMemory };
