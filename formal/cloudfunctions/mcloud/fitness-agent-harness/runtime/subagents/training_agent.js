const { PendingWriteType } = require("../../shared/types/agent_types.js");

function buildTrainingLogPending(slots) {
  const items = Array.isArray(slots.items) ? slots.items : [];
  const first = items[0] || {};
  return {
    type: PendingWriteType.TRAINING_LOG,
    target: "trainingLogs",
    data: {
      date: slots.date,
      items,
      source: "chat"
    },
    summaryForUser: first.exerciseName
      ? `训练记录：${first.exerciseName}${first.sets ? ` ${first.sets} 组` : ""}${first.reps ? ` 每组 ${first.reps} 次` : ""}${first.distanceKm ? ` ${first.distanceKm} 公里` : ""}${first.durationMin ? ` ${first.durationMin} 分钟` : ""}`
      : "训练记录"
  };
}

function buildTrainingLogReply(slots) {
  const item = slots.items && slots.items[0] || {};
  if (!item.exerciseName || item.exerciseName === "训练") {
    return "我还缺少具体训练动作，请补充动作名称、组数或时长。";
  }
  if (item.durationMin) {
    return `我识别到你完成了${item.exerciseName} ${item.durationMin} 分钟，是否确认记录？`;
  }
  return `我识别到你完成了${item.exerciseName}${item.sets ? ` ${item.sets} 组` : ""}${item.reps ? `，每组 ${item.reps} 次` : ""}${item.weightKg ? `，重量 ${item.weightKg} kg` : ""}${item.distanceKm ? `，距离 ${item.distanceKm} 公里` : ""}，是否确认记录？`;
}

function buildTrainingPlanPending(slots, operation) {
  return {
    type: PendingWriteType.TRAINING_PLAN,
    target: "trainingPlans",
    data: {
      date: slots.date,
      operation: operation || "create",
      goal: slots.goal || "",
      daysPerWeek: slots.daysPerWeek,
      equipment: slots.equipment || [],
      planName: slots.planName || "训练计划",
      exercises: slots.exercises || [],
      patch: slots.patch || null,
      source: "chat"
    },
    summaryForUser: operation === "update"
      ? "训练计划修改"
      : `${slots.goal || ""}训练计划`.trim()
  };
}

function buildTrainingPlanReply(slots, operation) {
  if (operation === "update") {
    return "我已整理出训练计划修改草稿，请确认后再写入计划。";
  }
  const pieces = [];
  if (slots.goal) pieces.push(slots.goal);
  if (slots.daysPerWeek) pieces.push(`每周 ${slots.daysPerWeek} 天`);
  if (slots.equipment && slots.equipment.length) pieces.push(`器械：${slots.equipment.join("、")}`);
  return `我已生成${pieces.length ? `${pieces.join("、")} ` : ""}训练计划草稿，请确认后再保存。`;
}

module.exports = {
  buildTrainingLogPending,
  buildTrainingLogReply,
  buildTrainingPlanPending,
  buildTrainingPlanReply
};
