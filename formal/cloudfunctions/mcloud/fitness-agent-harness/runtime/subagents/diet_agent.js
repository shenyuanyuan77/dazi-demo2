const { PendingWriteType } = require("../../shared/types/agent_types.js");

function buildDietRecordPending(slots) {
  const items = Array.isArray(slots.items) ? slots.items : [];
  return {
    type: PendingWriteType.DIET_LOG,
    target: "dietLogs",
    data: {
      date: slots.date,
      meal: slots.meal || "",
      items,
      source: "chat"
    },
    summaryForUser: items.length
      ? `饮食记录：${items.map(item => item.name).join("、")}`
      : "饮食记录：图片餐食待核对"
  };
}

function buildDietRecordReply(slots) {
  const items = Array.isArray(slots.items) ? slots.items : [];
  if (!items.length && slots.hasImages) {
    return "我已调用图片识别工具生成一条待确认饮食记录。请核对食物名称和分量，确认后再写入。";
  }
  if (!items.length) {
    return "我还缺少具体食物名称，请补充你吃了什么和大概分量。";
  }
  return `我识别到你要记录 ${items.map(item => item.name).join("、")}。是否确认写入饮食记录？`;
}

function buildDietSuggestionReply(toolResult) {
  const data = toolResult && toolResult.data || {};
  const advice = Array.isArray(data.advice) ? data.advice.join(" ") : "";
  if (Number.isFinite(Number(data.remainingCalories))) {
    return `按已有记录估算，今天剩余约 ${Math.round(data.remainingCalories)} kcal。${advice}`;
  }
  return advice || "我会结合你的目标、今日饮食和训练记录给出饮食建议。";
}

module.exports = {
  buildDietRecordPending,
  buildDietRecordReply,
  buildDietSuggestionReply
};
