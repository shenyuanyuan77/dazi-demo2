function missingProfileFields(profile) {
  const source = profile && profile.raw || profile || {};
  const missing = [];
  if (!source.gender || source.gender === "未设置") missing.push("性别");
  if (!(Number(source.age) > 0) && !source.birthday) missing.push("年龄或生日");
  if (!(Number(source.height) > 0)) missing.push("身高");
  if (!(Number(source.currentWeight || source.weight) > 0)) missing.push("当前体重");
  if (!source.goal) missing.push("当前目标");
  return missing;
}

function checkCalorieGapData(profile, nutrition, workout) {
  const target = Number(
    nutrition && nutrition.macroTargets && nutrition.macroTargets.calories ||
    profile && profile.calorieTarget
  );
  const missing = [];
  if (!(target > 0)) missing.push(...missingProfileFields(profile));
  if (!nutrition) missing.push("今日饮食数据");
  if (!workout) missing.push("今日训练数据");
  return {
    sufficient: missing.length === 0,
    missingData: Array.from(new Set(missing)),
    targetCalories: target || 0,
    consumedCalories: Math.max(0, Number(nutrition && nutrition.totalCalories) || 0),
    exerciseCalories: Math.max(0, Number(workout && workout.caloriesBurned) || 0)
  };
}

function checkWorkoutPlanData(profile, equipment, injuries) {
  const missing = [];
  if (!(profile && profile.goal)) missing.push("当前目标");
  if (!equipment) missing.push("可用器械");
  return {
    sufficient: missing.length === 0,
    missingData: missing,
    safetyNote: injuries ? "需要避开用户明确提到的不适动作" : ""
  };
}

module.exports = {
  missingProfileFields,
  checkCalorieGapData,
  checkWorkoutPlanData
};
