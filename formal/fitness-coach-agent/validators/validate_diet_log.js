const TRAINING_WORD_PATTERN = /(训练计划|训练安排|深蹲|俯卧撑|臀桥|平板支撑|组|次数|休息|弓步|提踵|卷腹|硬拉|卧推|划船)/;

function validateDietLogPayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object") return ["饮食记录 payload 不能为空"];
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) errors.push("饮食记录至少需要一个食物");

  items.forEach((item, index) => {
    const name = String(item && item.name || "").trim();
    if (!name) errors.push(`第 ${index + 1} 个食物名称不能为空`);
    if (TRAINING_WORD_PATTERN.test(name)) {
      errors.push(`第 ${index + 1} 个食物名称像训练内容，不是食物：${name}`);
    }
    const calories = Number(item && item.calories);
    if (!Number.isFinite(calories) || calories < 0) {
      errors.push(`${name || `第 ${index + 1} 个食物`} 热量必须是非负数`);
    }
  });

  if (!["", "breakfast", "lunch", "dinner", "snack", undefined].includes(payload.meal)) {
    errors.push("meal 必须是 breakfast/lunch/dinner/snack 或空值");
  }

  return errors;
}

module.exports = { validateDietLogPayload };
