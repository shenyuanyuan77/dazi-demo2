const fitnessStore = require("../store/fitness_store.js");
const validators = require("./validators.js");

function isValidDateKey(value) {
  const text = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00`);
  return !Number.isNaN(date.getTime()) && fitnessStore.dateKey(date) === text;
}

function validateFoodDraftPayload(payload = {}, sourceMessageId = "") {
  const errors = [];
  const operation = String(payload.operation || "create");
  const allowEmptyFoods = operation === "delete" || Boolean(payload.replaceMeal);
  if (!String(sourceMessageId || "").trim()) {
    errors.push("饮食草稿缺少来源消息，已阻止写入");
  }
  if (!isValidDateKey(payload.date)) {
    errors.push("当前日期无效");
  }
  if (!["breakfast", "lunch", "dinner", "snack"].includes(payload.mealType)) {
    errors.push("缺少目标餐次");
  }
  if (!Array.isArray(payload.foods) || (!payload.foods.length && !allowEmptyFoods)) {
    errors.push("没有可写入的食物");
  }
  (payload.foods || []).forEach(item => {
    if (!String(item.name || "").trim()) errors.push("食物名称不能为空");
    (item.validationErrors || []).forEach(error => {
      errors.push(`${item.name || "食物"}：${error}`);
    });
    if (
      item.confidence !== null &&
      item.confidence !== undefined &&
      Number(item.confidence) < 0.45
    ) {
      errors.push(`${item.name}识别置信度过低，请先修改或删除`);
    }
  });
  return Array.from(new Set(errors));
}

function validateWorkoutDraftPayload(payload = {}) {
  const errors = [];
  const operation = String(payload.operation || "create");
  if (operation === "delete") {
    if (!isValidDateKey(payload.date)) {
      errors.push("当前日期无效");
    }
    return errors;
  }
  if (!isValidDateKey(payload.date)) {
    errors.push("当前日期无效");
  }
  if (!Array.isArray(payload.exercises) || !payload.exercises.length) {
    errors.push("训练计划没有动作");
  }
  (payload.exercises || []).forEach(exercise => {
    if (!String(exercise.name || "").trim()) errors.push("训练动作名称不能为空");
    if (validators.hasInvalidExerciseName(exercise.name)) {
      errors.push(`训练动作名称无效：${exercise.name || "未命名动作"}`);
    }
    if (!Array.isArray(exercise.sets) || !exercise.sets.length) {
      errors.push(`${exercise.name || "训练动作"}缺少组数`);
    }
    (exercise.sets || []).forEach((set, index) => {
      if (set.reps === "" || set.reps === undefined || Number(set.reps) <= 0) {
        errors.push(`${exercise.name || "训练动作"}第 ${index + 1} 组缺少有效次数`);
      }
      if (set.weight !== "" && set.weight !== undefined && Number(set.weight) < 0) {
        errors.push(`${exercise.name || "训练动作"}第 ${index + 1} 组重量不能为负数`);
      }
      if (set.restSeconds !== undefined && Number(set.restSeconds) < 0) {
        errors.push(`${exercise.name || "训练动作"}第 ${index + 1} 组休息时间不能为负数`);
      }
    });
  });
  validators.validateWorkoutExercises(payload.exercises).forEach(error => errors.push(error));
  return Array.from(new Set(errors));
}

function validateProfileDraftPayload(payload = {}) {
  const operation = String(payload.operation || "create");
  if (operation === "delete") {
    return String(payload.recordId || "").trim()
      ? []
      : ["缺少要删除的身体数据记录"];
  }
  if (operation === "delete_fields") {
    if (!String(payload.recordId || "").trim()) return ["缺少要修改的身体数据记录"];
    const fields = Array.isArray(payload.fields) ? payload.fields.filter(Boolean) : [];
    return fields.length ? [] : ["缺少要删除的身体数据字段"];
  }
  if (operation === "update" && !String(payload.recordId || "").trim()) {
    return ["缺少要更新的身体数据记录"];
  }
  const profilePatch = payload.profilePatch && typeof payload.profilePatch === "object"
    ? payload.profilePatch
    : {};
  const entries = Object.keys(profilePatch).filter(key => {
    const value = profilePatch[key];
    return value !== undefined && value !== null && String(value).trim() !== "";
  });
  if (entries.length) return [];
  return ["没有可写入的身体数据"];
}

module.exports = {
  isValidDateKey,
  validateFoodDraftPayload,
  validateProfileDraftPayload,
  validateWorkoutDraftPayload
};
