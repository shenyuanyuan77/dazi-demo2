const GOAL_TYPES = {
  FAT_LOSS: "fat_loss",
  MUSCLE_GAIN: "muscle_gain",
  BODY_SHAPING: "body_shaping"
};

const GOAL_CONFIGS = {
  [GOAL_TYPES.FAT_LOSS]: {
    goalType: GOAL_TYPES.FAT_LOSS,
    name: "极限减脂",
    shortName: "减脂",
    englishName: "Fat Loss",
    shortName: "减脂",
    macroRatio: { carbs: 0.4, protein: 0.35, fat: 0.25 },
    calorieStrategy: "保持可持续热量缺口，优先保证蛋白质。",
    workoutStrategy: "复合动作、HIIT 和高耗能循环训练",
    defaultRestSeconds: 40,
    coachTone: "直接、积极，强调热量缺口和持续行动",
    homeFocus: "今日热量缺口",
    dietFocus: "控制精致碳水并补足高蛋白低脂食物",
    workoutFocus: "推荐 15-25 分钟复合动作或 HIIT 循环"
  },
  [GOAL_TYPES.MUSCLE_GAIN]: {
    goalType: GOAL_TYPES.MUSCLE_GAIN,
    name: "增肌强化",
    englishName: "Muscle Gain",
    shortName: "增肌",
    macroRatio: { carbs: 0.5, protein: 0.3, fat: 0.2 },
    calorieStrategy: "保持适度热量盈余，确保蛋白质和训练后补给。",
    workoutStrategy: "推拉腿或胸背腿分化力量训练",
    defaultRestSeconds: 105,
    coachTone: "专业、进取，强调渐进超负荷和恢复",
    homeFocus: "今日热量与蛋白质是否吃够",
    dietFocus: "蛋白质不足时及时增加优质加餐",
    workoutFocus: "记录重量与次数，尝试稳定突破上次表现"
  },
  [GOAL_TYPES.BODY_SHAPING]: {
    goalType: GOAL_TYPES.BODY_SHAPING,
    name: "匀称塑形",
    englishName: "Body Shaping / Recomp",
    shortName: "塑形",
    macroRatio: { carbs: 0.45, protein: 0.3, fat: 0.25 },
    calorieStrategy: "保持热量平稳和均衡配比，配合规律阻力训练。",
    workoutStrategy: "核心、普拉提、阻力带和中低重量多次数",
    defaultRestSeconds: 60,
    coachTone: "温和、稳定，强调体态、核心和饮食均衡",
    homeFocus: "今日营养配比与训练平衡",
    dietFocus: "训练日适度增加优质碳水，休息日保持热量平稳",
    workoutFocus: "核心收紧、体态调整和舒缓拉伸"
  }
};

const GOAL_ALIASES = {
  fat_loss: GOAL_TYPES.FAT_LOSS,
  "fat loss": GOAL_TYPES.FAT_LOSS,
  "极限减脂": GOAL_TYPES.FAT_LOSS,
  "减脂": GOAL_TYPES.FAT_LOSS,
  muscle_gain: GOAL_TYPES.MUSCLE_GAIN,
  "muscle gain": GOAL_TYPES.MUSCLE_GAIN,
  "增肌强化": GOAL_TYPES.MUSCLE_GAIN,
  "增肌": GOAL_TYPES.MUSCLE_GAIN,
  body_shaping: GOAL_TYPES.BODY_SHAPING,
  "body shaping": GOAL_TYPES.BODY_SHAPING,
  "body shaping / recomp": GOAL_TYPES.BODY_SHAPING,
  "匀称塑形": GOAL_TYPES.BODY_SHAPING,
  "塑形": GOAL_TYPES.BODY_SHAPING
};

function normalizeGoal(goal) {
  const key = String(goal || "").trim().toLowerCase();
  return GOAL_ALIASES[key] || GOAL_TYPES.BODY_SHAPING;
}

function getGoalConfig(goal) {
  return GOAL_CONFIGS[normalizeGoal(goal)];
}

function getMacroTargetsByGoal(goal, calorieTarget) {
  const calories = Math.max(0, Number(calorieTarget) || 0);
  const ratio = getGoalConfig(goal).macroRatio;
  const carbsCalories = Math.round(calories * ratio.carbs);
  const proteinCalories = Math.round(calories * ratio.protein);
  const fatCalories = Math.max(0, calories - carbsCalories - proteinCalories);
  return {
    carbsCalories,
    proteinCalories,
    fatCalories,
    carbsGram: Math.round(carbsCalories / 4),
    proteinGram: Math.round(proteinCalories / 4),
    fatGram: Math.round(fatCalories / 9)
  };
}

function getGoalOptions() {
  return Object.keys(GOAL_CONFIGS).map(key => GOAL_CONFIGS[key]);
}

module.exports = {
  GOAL_TYPES,
  GOAL_CONFIGS,
  normalizeGoal,
  getGoalConfig,
  getGoalOptions,
  getMacroTargetsByGoal
};
