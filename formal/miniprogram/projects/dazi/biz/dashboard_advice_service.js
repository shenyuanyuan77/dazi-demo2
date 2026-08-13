const goalConfig = require("../config/goal_config.js");
const bodyMetricsService = require("./body_metrics_service.js");

// 官方数据常量（来自 cloudfunctions/mcloud/project/dazi/data/，由运营同步）
// 故意在前端硬约束提示中携带来源徽标，符合设计令牌 "sourceRequired" 准则。
const OFFICIAL_HINTS = {
  DIET_SOURCE: '中国居民膳食指南2022',
  ACTIVITY_SOURCE: '中国成人身体活动指南2021',
  WATER_DAILY: '1500-1700ml/天',
  VEG_DAILY: '300-500g/天',
  PROTEIN_RULE: '1.0-1.6 g/kg'
};

function formatGap(value, unit) {
  const number = Math.max(0, Math.round(Number(value) || 0));
  return `${number}${unit || ""}`;
}

function summarizeNutritionGap(nutrient) {
  const out = [];
  if (Number(nutrient.protein) > 0 && Number(nutrient.proteinTarget) > 0 &&
      nutrient.protein < nutrient.proteinTarget * 0.6) {
    out.push(`蛋白质偏低（约 ${Math.round(nutrient.protein)}g），按 1.0-1.6g/kg 体重可适当增加`);
  }
  if (Number(nutrient.fat) > 0 && Number(nutrient.fatTarget) > 0 &&
      nutrient.fat > nutrient.fatTarget) {
    out.push(`脂肪偏高，烹调油控制在 25-30g/天（${OFFICIAL_HINTS.DIET_SOURCE}）`);
  }
  return out;
}

function buildDashboardAdvice(input) {
  const value = input || {};
  const profile = value.profile || {};
  const summary = value.summary || {};
  const targets = value.targets || {};
  const training = value.training || {};
  const config = value.config || goalConfig.getGoalConfig(profile.goal);
  const latest = bodyMetricsService.getLatestRecord();
  const body = latest && latest.metrics || {};
  const sevenDay = bodyMetricsService.getSevenDayInsights();
  const proteinGap = Math.max(0, Number(targets.protein) - Number(summary.protein));
  const carbsGap = Math.max(0, Number(targets.carbs) - Number(summary.carbs));
  const fatRemaining = Math.max(0, Number(targets.fat) - Number(summary.fat));
  const remaining = Number(value.remainingCalories) || 0;
  const hasNutrition = Number(summary.calories) > 0;
  const bodyNote = body.weight
    ? `最新体重 ${body.weight}kg${body.bodyFatRate ? `、体脂 ${body.bodyFatRate}%` : ""}`
    : "身体数据尚未完善";
  const recordNote = sevenDay.recordedNutritionDays
    ? `近 7 日有 ${sevenDay.recordedNutritionDays} 天饮食记录`
    : "近 7 日还没有完整饮食记录";
  const gapNotes = summarizeNutritionGap({
    protein: summary.protein,
    proteinTarget: targets.protein,
    fat: summary.fat,
    fatTarget: targets.fat
  });

  let title = `${config.name} · 今日重点`;
  let nutritionText = "";
  let workoutText = "";
  const actions = [];

  if (config.goalType === goalConfig.GOAL_TYPES.MUSCLE_GAIN) {
    nutritionText = hasNutrition
      ? `今日已摄入 ${summary.calories} / ${targets.calories} kcal，剩余约 ${formatGap(remaining, " kcal")}；蛋白质 ${summary.protein} / ${targets.protein}g。${proteinGap > 0 ? `下一餐建议补充约 ${formatGap(Math.min(40, proteinGap), "g")} 蛋白质。` : "蛋白质已达到今日目标，继续保持总热量充足。"}`
      : `今天目标热量为 ${targets.calories} kcal，蛋白质目标 ${targets.protein}g，目前还没有饮食记录。先记录早餐或当前餐，避免增肌期长期吃不够。`;
    workoutText = training.completed
      ? `力量训练已完成并消耗约 ${training.exerciseCalories} kcal，训练后优先补充蛋白质和优质碳水。`
      : "今天优先完成深蹲、卧推、划船等力量动作，记录重量和次数，并尝试在动作质量稳定的前提下渐进超负荷。";
    actions.push("优先补足全天热量与蛋白质", "力量训练组间保持充分休息");
  } else if (config.goalType === goalConfig.GOAL_TYPES.FAT_LOSS) {
    nutritionText = hasNutrition
      ? `今日已摄入 ${summary.calories} / ${targets.calories} kcal，当前可吃约 ${formatGap(remaining, " kcal")}。蛋白质还差 ${formatGap(proteinGap, "g")}，碳水还可安排约 ${formatGap(carbsGap, "g")}，脂肪余量约 ${formatGap(fatRemaining, "g")}。`
      : `今天目标热量为 ${targets.calories} kcal。先记录饮食，再根据剩余热量安排低脂高蛋白食物，避免高脂高糖食物挤占热量预算。`;
    workoutText = training.completed
      ? `今日运动消耗约 ${training.exerciseCalories} kcal，继续保证恢复，不需要用极端节食扩大缺口。`
      : "今天可安排 20-30 分钟复合动作循环或 HIIT，在保证动作安全的前提下提高消耗。";
    actions.push("保持适度热量缺口", "蛋白质不足时选择鸡胸肉、虾仁或豆制品");
  } else {
    nutritionText = hasNutrition
      ? `今日已摄入 ${summary.calories} / ${targets.calories} kcal，蛋白质 ${summary.protein} / ${targets.protein}g。建议保持热量平稳，继续补充蔬菜和优质蛋白。`
      : `今天目标热量为 ${targets.calories} kcal，目前还没有饮食记录。先记录一餐，后续按蛋白质、蔬菜和主食均衡分配。`;
    workoutText = training.completed
      ? `训练已完成并消耗约 ${training.exerciseCalories} kcal，可适度补充优质碳水并安排拉伸恢复。`
      : "今天适合安排核心、臀腿和体态训练，使用中低重量、多次数，并在结束后完成拉伸。";
    actions.push("维持热量和三大营养素平衡", "关注核心稳定、体态和活动度");
  }

  // 把官方权威来源作为 sources 字段返回，前端 advice-card 可以显示徽标。
  const sources = [OFFICIAL_HINTS.DIET_SOURCE];
  if (training && training.weeklyMinutes !== undefined) {
    sources.push(OFFICIAL_HINTS.ACTIVITY_SOURCE);
  }

  return {
    title,
    summary: `${nutritionText}${workoutText}`,
    context: `${bodyNote}；${recordNote}${sevenDay.weightChange ? `；近 7 日体重变化 ${sevenDay.weightChange > 0 ? "+" : ""}${sevenDay.weightChange}kg` : ""}。`,
    actions,
    sources,
    gapNotes
  };
}

module.exports = {
  buildDashboardAdvice,
  OFFICIAL_HINTS
};
