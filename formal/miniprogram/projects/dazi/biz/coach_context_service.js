const fitnessStore = require("../store/fitness_store.js");
const goalConfig = require("../config/goal_config.js");
const bodyMetricsService = require("./body_metrics_service.js");

function buildCoachContext(userProfile, nutritionSummary, workoutSummary, goal) {
  const state = (!userProfile || !nutritionSummary || !workoutSummary)
    ? fitnessStore.getState()
    : {};
  const profile = userProfile || state.userProfile;
  const nutrition = nutritionSummary || state.nutritionSummary;
  const workout = workoutSummary || state.workoutSummary;
  const config = goalConfig.getGoalConfig(goal || profile.goal);
  const targets = nutrition.macroTargets || {};
  const remainingCalories = Math.round(
    (Number(targets.calories) || profile.calorieTarget || 0) -
    (Number(nutrition.totalCalories) || 0) +
    (Number(workout.caloriesBurned) || 0)
  );
  return {
    userProfile: profile,
    nutritionSummary: nutrition,
    workoutSummary: workout,
    goal: config,
    remainingCalories,
    proteinMet: Number(nutrition.totalProtein) >= Number(targets.protein || 0),
    weeklyTrainingFrequency: state.weeklyTrainingFrequency === undefined
      ? Math.max(0, Number(profile.weeklyTrainingFrequency) || 0)
      : state.weeklyTrainingFrequency,
    latestBodyMetrics: bodyMetricsService.getLatestRecord(),
    sevenDayInsights: bodyMetricsService.getSevenDayInsights(),
    energyAssessment: profile.energyAssessment || null
  };
}

function buildProactiveGreeting(context) {
  const value = context || buildCoachContext();
  const { goal, nutritionSummary, workoutSummary } = value;
  if (value.weeklyTrainingFrequency === 0) {
    return goal.goalType === goalConfig.GOAL_TYPES.FAT_LOSS
      ? "我看到你近 7 天还没有训练。需要我生成一套 20 分钟居家无器械减脂训练吗？"
      : `本周训练还没开始。按${goal.name}目标，${goal.workoutFocus}，需要我现在生成计划吗？`;
  }
  if (!value.proteinMet && nutritionSummary.totalCalories > 0) {
    return goal.goalType === goalConfig.GOAL_TYPES.MUSCLE_GAIN
      ? `今天蛋白质还没达标，当前约 ${nutritionSummary.totalProtein}g。需要我安排一份增肌加餐吗？`
      : `今天蛋白质摄入偏低，剩余可吃约 ${Math.max(0, value.remainingCalories)} kcal。需要高蛋白晚餐建议吗？`;
  }
  if (!workoutSummary.completed) {
    return goal.goalType === goalConfig.GOAL_TYPES.BODY_SHAPING
      ? "今天训练尚未完成，建议安排核心与拉伸组合，让体态和线条更稳定。"
      : `今天训练尚未完成。${goal.workoutFocus}，需要我帮你拆成可执行动作吗？`;
  }
  return `今日训练已完成，预计消耗 ${workoutSummary.caloriesBurned} kcal。${goal.dietFocus}。`;
}

function buildMockReply(command, context) {
  const text = String(command || "");
  const value = context || buildCoachContext();
  const goal = value.goal;
  if (text.includes("高蛋白饮食")) {
    if (goal.goalType === goalConfig.GOAL_TYPES.MUSCLE_GAIN) {
      return "增肌高蛋白方案：早餐鸡蛋加牛奶，午餐鸡胸或牛肉配米饭，训练后补一份酸奶或乳清蛋白，晚餐鱼虾配主食。优先补足全天蛋白质和总热量。";
    }
    return `${goal.name}高蛋白方案：每餐安排一掌心鸡胸、鱼虾或豆腐，搭配大量蔬菜；主食按训练量调整，尽量选择低脂烹饪。`;
  }
  if (text.includes("居家哑铃训练")) {
    return goal.goalType === goalConfig.GOAL_TYPES.FAT_LOSS
      ? "建议做 4 轮循环：哑铃深蹲 15 次、推举 12 次、俯身划船 12 次、波比跳 8 次。动作间少休息，每轮休息 40 秒。"
      : (goal.goalType === goalConfig.GOAL_TYPES.MUSCLE_GAIN
        ? "建议哑铃推胸、单臂划船、杯式深蹲和罗马尼亚硬拉各 4 组，每组 8-12 次，组间休息约 105 秒，最后两次应有明显挑战。"
        : "建议杯式深蹲、肩外旋、单臂划船和死虫式各 3 组，每组 12-15 次，组间休息 60 秒，重点保持核心稳定。");
  }
  if (text.includes("热量差")) {
    return `今日已摄入 ${value.nutritionSummary.totalCalories} kcal，训练消耗 ${value.workoutSummary.caloriesBurned} kcal，当前剩余可吃约 ${value.remainingCalories} kcal。${goal.calorieStrategy}`;
  }
  if (text.includes("生理期") || text.includes("伤病")) {
    return "优先以安全和恢复为准：降低重量与训练密度，避免疼痛动作，可改为步行、呼吸训练和温和拉伸。若有持续疼痛、异常出血或明显不适，请暂停训练并咨询医生。";
  }
  return `${buildProactiveGreeting(value)} 当前目标是${goal.name}，我会按“${goal.calorieStrategy}”为你调整建议。`;
}

module.exports = {
  buildCoachContext,
  buildProactiveGreeting,
  buildMockReply
};
