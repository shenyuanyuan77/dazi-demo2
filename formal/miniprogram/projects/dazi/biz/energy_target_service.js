const goalConfig = require("../config/goal_config.js");

const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9
};

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function calculateAge(profile) {
  const direct = Number(profile && profile.age);
  if (direct > 0) return Math.floor(direct);
  const birthday = profile && profile.birthday;
  if (!birthday) return 0;
  const birth = new Date(`${birthday}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return 0;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDelta = today.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) age -= 1;
  return Math.max(0, age);
}

function normalizeGender(value) {
  const text = String(value || "").toLowerCase();
  if (text === "男" || text.includes("male")) return "male";
  if (text === "女" || text.includes("female")) return "female";
  return "";
}

function inferActivityLevel(profile, weeklyTrainingFrequency) {
  const explicit = String(profile && profile.activityLevel || "");
  if (ACTIVITY_FACTORS[explicit]) return explicit;
  const frequency = Math.max(
    0,
    Number(weeklyTrainingFrequency === undefined
      ? profile && profile.weeklyTrainingFrequency
      : weeklyTrainingFrequency) || 0
  );
  if (frequency >= 7) return "very_active";
  if (frequency >= 5) return "active";
  if (frequency >= 3) return "moderate";
  if (frequency >= 1) return "light";
  return "light";
}

function inspectInputs(profile, weeklyTrainingFrequency) {
  const source = profile && profile.raw || profile || {};
  const missingData = [];
  const gender = normalizeGender(source.gender);
  const age = calculateAge(source);
  const weight = positive(source.currentWeight || source.weight, 65);
  const targetWeight = positive(source.targetWeight, weight);
  const height = positive(source.height, 170);
  const deviceBmr = positive(source.deviceBmr || source.bmr, 0);
  if (!gender) missingData.push("性别");
  if (!age) missingData.push("年龄或生日");
  if (!(Number(source.currentWeight || source.weight) > 0)) missingData.push("当前体重");
  if (!(Number(source.height) > 0)) missingData.push("身高");
  return {
    gender: gender || "male",
    age: age || 30,
    weight,
    targetWeight,
    height,
    deviceBmr,
    bodyFatRate: positive(source.bodyFat || source.bodyFatRate, 0),
    goal: goalConfig.normalizeGoal(source.goal),
    activityLevel: inferActivityLevel(source, weeklyTrainingFrequency),
    missingData
  };
}

function calculateBmr({ gender, age, weight, height }) {
  const base = 10 * positive(weight, 65) +
    6.25 * positive(height, 170) -
    5 * positive(age, 30);
  return Math.round(base + (normalizeGender(gender) === "female" || gender === "female" ? -161 : 5));
}

function calculateTdee(bmr, activityLevel) {
  return Math.round(
    Math.max(0, Number(bmr) || 0) *
    (ACTIVITY_FACTORS[activityLevel] || ACTIVITY_FACTORS.sedentary)
  );
}

function calculateGoalCalories(tdee, bmr, goal, currentWeight, targetWeight) {
  const normalized = goalConfig.normalizeGoal(goal);
  const weightGap = Number(targetWeight) - Number(currentWeight);
  let factor = 1;
  if (normalized === goalConfig.GOAL_TYPES.FAT_LOSS) factor = 0.85;
  if (normalized === goalConfig.GOAL_TYPES.MUSCLE_GAIN) factor = 1.1;
  if (normalized === goalConfig.GOAL_TYPES.BODY_SHAPING) {
    factor = weightGap < -1 ? 0.95 : (weightGap > 1 ? 1.03 : 1);
  }
  let weightGapFactor = 0;
  if (normalized === goalConfig.GOAL_TYPES.FAT_LOSS) {
    weightGapFactor = weightGap <= -5 ? -0.02 : (weightGap < -0.5 ? -0.01 : 0);
  } else if (normalized === goalConfig.GOAL_TYPES.MUSCLE_GAIN && weightGap > 1) {
    weightGapFactor = 0.02;
  }
  const calculated = Math.round((Number(tdee) || 0) * (factor + weightGapFactor));
  return normalized === goalConfig.GOAL_TYPES.FAT_LOSS
    ? Math.max(Math.round(Number(bmr) || 0), calculated)
    : calculated;
}

function evaluateEnergyTarget(profile, options) {
  const input = inspectInputs(profile, options && options.weeklyTrainingFrequency);
  const systemBmr = calculateBmr(input);
  const useDeviceBmr = input.missingData.some(item => item === "性别" || item === "年龄或生日") &&
    input.deviceBmr > 0;
  const bmrForTarget = useDeviceBmr ? input.deviceBmr : systemBmr;
  const tdee = calculateTdee(bmrForTarget, input.activityLevel);
  const calorieTarget = calculateGoalCalories(
    tdee,
    bmrForTarget,
    input.goal,
    input.weight,
    input.targetWeight
  );
  const weightGap = Math.round((input.targetWeight - input.weight) * 10) / 10;
  const neutralGoalTarget = calculateGoalCalories(tdee, bmrForTarget, input.goal, input.weight, input.weight);
  return {
    bmr: bmrForTarget,
    deviceBmr: input.deviceBmr || 0,
    systemBmr,
    tdee,
    calorieTarget,
    targetCalories: calorieTarget,
    goalAdjustment: neutralGoalTarget - tdee,
    weightGap,
    weightGapAdjustment: calorieTarget - neutralGoalTarget,
    activityLevel: input.activityLevel,
    activityFactor: ACTIVITY_FACTORS[input.activityLevel],
    goal: input.goal,
    macros: goalConfig.getMacroTargetsByGoal(input.goal, calorieTarget),
    missingData: input.missingData,
    estimated: input.missingData.length > 0,
    explanation: [
      input.deviceBmr ? `设备基础代谢 ${input.deviceBmr} kcal` : "",
      `系统公式基础代谢 ${systemBmr} kcal`,
      useDeviceBmr ? "因缺少年龄或性别，当前 TDEE 暂以设备基础代谢为参考" : "",
      `估算 TDEE ${tdee} kcal`,
      `目标体重差 ${weightGap} kg`,
      `按${goalConfig.getGoalConfig(input.goal).name}策略建议每日摄入 ${calorieTarget} kcal`
    ].filter(Boolean).join("；") + "。"
  };
}

module.exports = {
  ACTIVITY_FACTORS,
  calculateAge,
  normalizeGender,
  inferActivityLevel,
  inspectInputs,
  calculateBmr,
  calculateTdee,
  calculateGoalCalories,
  evaluateEnergyTarget
};
