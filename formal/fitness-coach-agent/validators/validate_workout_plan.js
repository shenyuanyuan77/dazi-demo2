const INVALID_EXERCISE_NAME_PATTERN = /(我想|我是说|帮我|安排|计划|训练计划|做一个|给我|目标|需要|想练|练腿|练胸|练背|练肩|练手|改成|换成|保存|写入)/;
const FOOD_WORD_PATTERN = /(米饭|鸡胸|鸡腿|牛奶|鸡蛋|早餐|午餐|晚餐|加餐|食物|餐食|饮食|蛋白质|碳水|脂肪|kcal)/;

function validateWorkoutPlanPayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object") {
    return ["训练计划 payload 不能为空"];
  }
  const exercises = Array.isArray(payload.exercises) ? payload.exercises : [];
  if (!exercises.length) errors.push("训练计划至少需要一个动作");

  exercises.forEach((exercise, index) => {
    const name = String(exercise && exercise.name || "").trim();
    if (!name) errors.push(`第 ${index + 1} 个动作名称不能为空`);
    if (INVALID_EXERCISE_NAME_PATTERN.test(name)) {
      errors.push(`第 ${index + 1} 个动作名称像用户意图，不是动作名：${name}`);
    }
    if (FOOD_WORD_PATTERN.test(name)) {
      errors.push(`第 ${index + 1} 个动作名称像饮食内容，不是训练动作：${name}`);
    }
    const sets = Array.isArray(exercise && exercise.sets) ? exercise.sets : [];
    if (!sets.length) errors.push(`${name || `第 ${index + 1} 个动作`} 至少需要一组`);
    sets.forEach((set, setIndex) => {
      const reps = String(set && (set.reps || set.duration) || "").trim();
      if (!reps) errors.push(`${name || `第 ${index + 1} 个动作`} 第 ${setIndex + 1} 组缺少 reps 或 duration`);
    });
  });

  return errors;
}

module.exports = {
  INVALID_EXERCISE_NAME_PATTERN,
  validateWorkoutPlanPayload
};
