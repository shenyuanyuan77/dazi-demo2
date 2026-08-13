const { PendingWriteType } = require("../../shared/types/agent_types.js");

function hasBodyMetrics(slots) {
  return Boolean(slots && slots.metrics && Object.keys(slots.metrics).length);
}

function buildBodyMetricPending(slots) {
  return {
    type: PendingWriteType.BODY_METRIC,
    target: "bodyMetrics",
    data: {
      date: slots.date,
      metrics: slots.metrics || {},
      source: slots.hasImages ? "image" : "chat"
    },
    summaryForUser: Object.keys(slots.metrics || {}).map(key => `${key}: ${slots.metrics[key]}`).join("，")
  };
}

function buildBodyAnalysisReply(slots, analyzeResult) {
  if (hasBodyMetrics(slots)) {
    const parts = [];
    if (slots.heightCm) parts.push(`身高 ${slots.heightCm} cm`);
    if (slots.weightKg) parts.push(`体重 ${slots.weightKg} kg`);
    if (slots.bodyFatRate) parts.push(`体脂 ${slots.bodyFatRate}%`);
    return `我识别到${parts.join("，")}。这些身体数据需要你确认后才会写入记录。`;
  }
  const advice = analyzeResult && analyzeResult.data && Array.isArray(analyzeResult.data.advice)
    ? analyzeResult.data.advice.join(" ")
    : "我会结合最新身体数据和趋势给出分析。";
  return advice;
}

function buildBodyReadOnlyReply(slots) {
  const parts = [];
  if (slots.heightCm) parts.push(`身高 ${slots.heightCm} cm`);
  if (slots.weightKg) parts.push(`体重 ${slots.weightKg} kg`);
  if (slots.bodyFatRate) parts.push(`体脂 ${slots.bodyFatRate}%`);
  const prefix = parts.length ? `基于你提供的${parts.join("，")}，` : "";
  return `${prefix}我只做分析，不会写入记录。建议关注 7 日趋势，减脂期优先保证蛋白质、力量训练和稳定睡眠。`;
}

module.exports = {
  buildBodyAnalysisReply,
  buildBodyMetricPending,
  buildBodyReadOnlyReply,
  hasBodyMetrics
};
