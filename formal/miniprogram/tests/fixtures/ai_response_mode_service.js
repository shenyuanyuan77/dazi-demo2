const goalConfig = require("../config/goal_config.js");
const dataSufficiency = require("../../projects/dazi/biz/ai_data_sufficiency_service.js");

function emptyPayload(intent, answerType, text) {
  return {
    type: "general",
    content: text,
    payload: {
      intent,
      answer: { type: answerType, text, cards: [] },
      proposals: []
    }
  };
}

function buildDeterministicResponse(intentResult, context) {
  const intent = intentResult.intent;
  const value = context || {};
  const profile = value.userProfile || {};
  const nutrition = value.nutritionSummary || {};
  const workout = value.workoutSummary || {};
  const goal = value.goal || goalConfig.getGoalConfig(profile.goal);

  if (intent === "body_status_evaluation") {
    const raw = profile.raw || profile;
    const entities = intentResult.entities || {};
    const height = Number(entities.height || profile.height || raw.height);
    const weight = Number(entities.weight || profile.weight || raw.currentWeight || raw.weight);
    const bodyFat = Number(raw.bodyFat || raw.bodyFatRate || 0);
    if (!(height > 0) || !(weight > 0)) {
      return emptyPayload(
        intentResult,
        "body_status_evaluation",
        "我可以帮你评估身体状态，但目前至少还需要身高和体重。你可以直接告诉我，例如“身高180cm，体重80kg”。"
      );
    }
    const bmi = Math.round(weight / Math.pow(height / 100, 2) * 10) / 10;
    const bmiStatus = bmi < 18.5
      ? "偏低"
      : (bmi < 24 ? "正常范围" : (bmi < 28 ? "接近或进入超重范围" : "偏高"));
    const missing = [];
    if (!raw.gender || raw.gender === "未设置") missing.push("性别");
    if (!(Number(raw.age) > 0) && !raw.birthday) missing.push("年龄");
    if (!bodyFat) missing.push("体脂率");
    const lines = [
      `按身高 ${height}cm、体重 ${weight}kg 计算，你的 BMI 约为 ${bmi}，属于${bmiStatus}。`,
      bodyFat
        ? `你当前记录的体脂率约为 ${bodyFat}%，判断身体组成时应把它与 BMI、腰围和训练情况一起看，不能只用“胖或不胖”概括。`
        : "BMI 不能区分肌肉和脂肪，因此还不能只凭这个数字判断“胖不胖”。",
      `你当前目标是${goal.name}，更合适的方向是保持规律力量训练、蛋白质达标，并根据目标热量做温和调整。`,
      missing.length
        ? `目前还缺少${missing.join("、")}，补充后基础代谢和体脂判断会更准确。`
        : ""
    ].filter(Boolean);
    return emptyPayload(intentResult, "body_status_evaluation", lines.join("\n"));
  }

  if (intent === "ambiguous") {
    return emptyPayload(
      intentResult,
      "clarification",
      "请告诉我你想解决的具体问题，例如评估身体状态、分析一餐、查看今日热量差，或生成训练计划。"
    );
  }
  if (intent === "calorie_gap_evaluation") {
    const check = dataSufficiency.checkCalorieGapData(profile, nutrition, workout);
    intentResult.missingData = check.missingData;
    if (!check.sufficient) {
      return emptyPayload(
        intentResult,
        "calorie_gap_analysis",
        `我还缺少${check.missingData.join("、")}，因此不能准确计算今日热量差。请先完善资料或记录饮食。`
      );
    }
    const remaining = Math.round(
      check.targetCalories - check.consumedCalories + check.exerciseCalories
    );
    const assessment = profile.energyAssessment || {};
    const text = [
      `今日目标 ${check.targetCalories} kcal，已摄入 ${check.consumedCalories} kcal，运动消耗 ${check.exerciseCalories} kcal。`,
      `当前剩余可吃约 ${remaining} kcal。`,
      assessment.bmr
        ? `目标来自 BMR ${assessment.bmr} kcal、TDEE ${assessment.tdee} kcal 和${goal.name}策略。`
        : ""
    ].filter(Boolean).join("\n");
    return emptyPayload(intentResult, "calorie_gap_analysis", text);
  }
  if (intent === "meal_plan_generation") {
    const target = profile.calorieTarget || 0;
    const protein = nutrition.macroTargets && nutrition.macroTargets.protein || 0;
    const text = [
      `${goal.name}高蛋白饮食计划：`,
      "早餐：鸡蛋、无糖牛奶和燕麦；午餐：鸡胸肉或牛肉、米饭和蔬菜；加餐：无糖酸奶或豆制品；晚餐：鱼虾、豆腐和适量主食。",
      target ? `全天参考 ${target} kcal，蛋白质目标约 ${protein}g。` : "完善身体资料后可以进一步计算总热量和蛋白质克数。",
      "这是一份未来计划，不会写入今天的饮食记录。"
    ].join("\n");
    return emptyPayload(intentResult, "meal_plan", text);
  }
  if (intent === "nutrition_knowledge_qa") {
    return emptyPayload(
      intentResult,
      "knowledge_answer",
      "减脂期保证蛋白质有助于维持肌肉和饱腹感，也能支持训练恢复。重点是全天总量和持续的适度热量缺口，不需要极端节食。"
    );
  }
  if (intent === "fitness_knowledge_qa") {
    return emptyPayload(
      intentResult,
      "knowledge_answer",
      "训练频率取决于强度和恢复。高强度训练通常不适合每天重复同一肌群；出现疼痛、明显疲劳或动作质量下降时应降低强度并恢复。"
    );
  }
  if (intent === "food_analysis_only" && !intentResult.shouldUseHistory) {
    if (Number(nutrition.totalCalories) > 0) {
      const targets = nutrition.macroTargets || {};
      const text = [
        `今天已记录 ${nutrition.totalCalories} kcal，蛋白质 ${nutrition.totalProtein}g、碳水 ${nutrition.totalCarbs}g、脂肪 ${nutrition.totalFat}g。`,
        targets.protein && nutrition.totalProtein < targets.protein
          ? `蛋白质距离目标还差约 ${Math.max(0, Math.round(targets.protein - nutrition.totalProtein))}g，下一餐可优先补充低脂优质蛋白。`
          : "当前蛋白质进度基本合理，继续关注总热量和蔬菜摄入。",
        `以上按${goal.name}目标分析，不会自动写入任何新记录。`
      ].join("\n");
      return emptyPayload(intentResult, "food_analysis", text);
    }
    return emptyPayload(
      intentResult,
      "food_analysis",
      "我还没有看到你今天的饮食记录。你想分析某一餐，还是分析今天已经记录的饮食？也可以上传图片或描述食物和大致份量。"
    );
  }
  return null;
}

module.exports = {
  buildDeterministicResponse
};
