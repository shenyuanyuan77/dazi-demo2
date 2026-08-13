const userStorage = require("./user_storage.js");
const fitnessStore = require("../store/fitness_store.js");

const RECORDS_KEY = "fitness_body_metrics_records";
const PROFILE_KEY = "fitness_profile";

const BODY_FIELD_ALIASES = {
  weight: ["weight", "currentWeight", "体重", "当前体重", "重量"],
  bmi: ["bmi", "BMI", "身体质量指数"],
  bodyFatRate: ["bodyFatRate", "bodyFat", "体脂率", "脂肪率", "身体脂肪"],
  bodyWaterMass: ["bodyWaterMass", "waterMass", "体水分量"],
  fatMass: ["fatMass", "脂肪量"],
  boneMass: ["boneMass", "骨量", "骨骼量"],
  proteinMass: ["proteinMass", "蛋白质量"],
  muscleMass: ["muscleMass", "肌肉量", "肌肉重量"],
  muscleRate: ["muscleRate", "肌肉率"],
  waterRate: ["waterRate", "bodyWater", "身体水分", "体水分", "水分率"],
  proteinRate: ["proteinRate", "蛋白率", "蛋白质率"],
  boneRate: ["boneRate", "骨骼率"],
  skeletalMuscleMass: ["skeletalMuscleMass", "骨骼肌量"],
  deviceBmr: ["deviceBmr", "bmr", "基础代谢", "基础代谢率", "BMR"],
  visceralFatLevel: ["visceralFatLevel", "visceralFat", "内脏脂肪", "内脏脂肪等级"],
  waistHipRatio: ["waistHipRatio", "推测腰臀比", "腰臀比"],
  bodyAge: ["bodyAge", "身体年龄"],
  leanBodyMass: ["leanBodyMass", "去脂体重"],
  heartRate: ["heartRate", "心率", "脉搏"],
  standardWeight: ["standardWeight", "标准体重"],
  weightControl: ["weightControl", "体重控制"],
  fatControl: ["fatControl", "脂肪控制"]
};

const FIELD_DEFINITIONS = [
  { key: "weight", profileKey: "currentWeight", label: "当前体重", unit: "kg", section: "basic" },
  { key: "targetWeight", profileKey: "targetWeight", label: "目标体重", unit: "kg", section: "basic" },
  { key: "height", profileKey: "height", label: "身高", unit: "cm", section: "basic" },
  { key: "bmi", label: "BMI", unit: "", section: "composition" },
  { key: "bodyFatRate", profileKey: "bodyFat", label: "体脂率", unit: "%", section: "composition" },
  { key: "bodyWaterMass", label: "体水分量", unit: "kg", section: "composition" },
  { key: "fatMass", label: "脂肪量", unit: "kg", section: "composition" },
  { key: "boneMass", label: "骨量", unit: "kg", section: "composition" },
  { key: "proteinMass", label: "蛋白质量", unit: "kg", section: "composition" },
  { key: "muscleMass", label: "肌肉量", unit: "kg", section: "composition" },
  { key: "muscleRate", label: "肌肉率", unit: "%", section: "composition" },
  { key: "waterRate", label: "身体水分", unit: "%", section: "composition" },
  { key: "proteinRate", label: "蛋白质率", unit: "%", section: "composition" },
  { key: "boneRate", label: "骨骼率", unit: "%", section: "composition" },
  { key: "skeletalMuscleMass", label: "骨骼肌量", unit: "kg", section: "composition" },
  { key: "deviceBmr", profileKey: "deviceBmr", label: "设备基础代谢", unit: "kcal", section: "composition" },
  { key: "visceralFatLevel", label: "内脏脂肪等级", unit: "", section: "composition" },
  { key: "waistHipRatio", label: "推测腰臀比", unit: "", section: "composition" },
  { key: "bodyAge", label: "身体年龄", unit: "岁", section: "composition" },
  { key: "leanBodyMass", label: "去脂体重", unit: "kg", section: "composition" },
  { key: "heartRate", label: "心率", unit: "次/分", section: "composition" },
  { key: "standardWeight", label: "标准体重", unit: "kg", section: "composition" },
  { key: "weightControl", label: "体重控制", unit: "kg", section: "composition", allowNegative: true },
  { key: "fatControl", label: "脂肪控制", unit: "kg", section: "composition", allowNegative: true },
  { key: "waist", profileKey: "waist", label: "腰围", unit: "cm", section: "circumference" },
  { key: "hip", profileKey: "hip", label: "臀围", unit: "cm", section: "circumference" },
  { key: "chest", profileKey: "chest", label: "胸围", unit: "cm", section: "circumference" },
  { key: "thigh", label: "大腿围", unit: "cm", section: "circumference" },
  { key: "calf", label: "小腿围", unit: "cm", section: "circumference" },
  { key: "upperArm", label: "上臂围", unit: "cm", section: "circumference" },
  { key: "shoulder", label: "肩围", unit: "cm", section: "circumference" }
];

const FIELD_PATTERNS = {
  weight: /(?:当前)?体重\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
  targetWeight: /目标体重\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
  height: /身高\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
  bmi: /\bBMI\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
  bodyFatRate: /体脂(?:率)?\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
  bodyWaterMass: /(?:体水分量|体水分)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*kg/i,
  fatMass: /脂肪量\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
  boneMass: /骨量\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
  proteinMass: /蛋白质量\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
  muscleMass: /肌肉量\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
  muscleRate: /肌肉率\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
  waterRate: /(?:水分率|身体水分)\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
  boneRate: /骨骼率\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
  skeletalMuscleMass: /骨骼肌量\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
  deviceBmr: /(?:基础代谢率?|BMR)\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
  visceralFatLevel: /内脏脂肪(?:等级)?\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
  waistHipRatio: /(?:推测腰臀比|腰臀比)\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
  bodyAge: /身体年龄\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
  proteinRate: /蛋白质率\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
  leanBodyMass: /去脂体重\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
  heartRate: /(?:心率|脉搏)\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
  standardWeight: /标准体重\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
  weightControl: /体重控制\s*[:：]?\s*(-?\d+(?:\.\d+)?)/i,
  fatControl: /脂肪控制\s*[:：]?\s*(-?\d+(?:\.\d+)?)/i,
  waist: /腰围\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
  hip: /臀围\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
  chest: /胸围\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
  thigh: /大腿围\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
  calf: /小腿围\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
  upperArm: /上臂围\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
  shoulder: /肩围\s*[:：]?\s*(\d+(?:\.\d+)?)/i
};

function safeNumber(value, allowNegative) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const number = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) && (allowNegative || number >= 0) ? number : null;
}

function round(value, precision) {
  const factor = Math.pow(10, precision || 0);
  return Math.round(value * factor) / factor;
}

function normalizeMetrics(source) {
  const input = source && typeof source === "object" ? source : {};
  const normalized = {};
  FIELD_DEFINITIONS.forEach(field => {
    const aliases = BODY_FIELD_ALIASES[field.key] || [field.key];
    const sourceKey = aliases.find(key => input[key] !== undefined);
    const value = safeNumber(
      sourceKey === undefined ? input[field.key] : input[sourceKey],
      field.allowNegative
    );
    if (value !== null) normalized[field.key] = round(value, 1);
  });
  if (!Object.prototype.hasOwnProperty.call(normalized, "bodyFatRate")) {
    const legacyBodyFat = safeNumber(input.bodyFat);
    if (legacyBodyFat !== null) normalized.bodyFatRate = round(legacyBodyFat, 1);
  }
  if (!Object.prototype.hasOwnProperty.call(normalized, "weight")) {
    const legacyWeight = safeNumber(input.currentWeight);
    if (legacyWeight !== null) normalized.weight = round(legacyWeight, 1);
  }
  if (!Object.prototype.hasOwnProperty.call(normalized, "deviceBmr")) {
    const legacyBmr = safeNumber(input.bmr);
    if (legacyBmr !== null) normalized.deviceBmr = round(legacyBmr, 1);
  }
  if (
    !Object.prototype.hasOwnProperty.call(normalized, "bmi") &&
    normalized.weight &&
    normalized.height
  ) {
    normalized.bmi = round(normalized.weight / Math.pow(normalized.height / 100, 2), 1);
  }
  return normalized;
}

function parseBodyMetricsText(text) {
  const source = String(text || "").replace(/，/g, ",");
  const parsed = {};
  Object.keys(FIELD_PATTERNS).forEach(key => {
    const match = source.match(FIELD_PATTERNS[key]);
    const definition = FIELD_DEFINITIONS.find(field => field.key === key);
    if (match) parsed[key] = safeNumber(match[1], definition && definition.allowNegative);
  });
  return normalizeMetrics(parsed);
}

function getRecords() {
  if (typeof wx === "undefined") return [];
  const records = userStorage.get(RECORDS_KEY, []);
  return Array.isArray(records) ? records : [];
}

function getLatestRecord() {
  const records = getRecords();
  if (records.length) return records[records.length - 1];
  if (typeof wx === "undefined") return null;
  const profile = userStorage.get(PROFILE_KEY, {});
  const metrics = normalizeMetrics(profile);
  return Object.keys(metrics).length ? {
    id: "profile-fallback",
    recordedAt: "",
    date: fitnessStore.dateKey(),
    source: "profile",
    metrics
  } : null;
}

function buildProfilePatch(metrics) {
  const patch = {};
  FIELD_DEFINITIONS.forEach(field => {
    if (!field.profileKey || metrics[field.key] === undefined) return;
    patch[field.profileKey] = String(metrics[field.key]);
  });
  return patch;
}

function rebuildDerivedState(records) {
  const list = Array.isArray(records) ? records.slice() : [];
  const latest = list.length ? list[list.length - 1] : null;
  const profile = Object.assign({}, userStorage.get(PROFILE_KEY, {}));

  FIELD_DEFINITIONS.forEach(field => {
    if (!field.profileKey) return;
    delete profile[field.profileKey];
  });
  if (latest && latest.metrics) {
    Object.assign(profile, buildProfilePatch(latest.metrics));
  }
  userStorage.set(PROFILE_KEY, profile);

  const weightByDate = {};
  list.forEach(record => {
    if (!record || !record.metrics || record.metrics.weight === undefined) return;
    weightByDate[record.date] = Number(record.metrics.weight);
  });
  const history = Object.keys(weightByDate)
    .sort((left, right) => String(left).localeCompare(String(right)))
    .map(date => ({ date, value: weightByDate[date] }))
    .slice(-180);
  userStorage.set(fitnessStore.WEIGHT_HISTORY_KEY, history);
}

function getRecordById(recordId) {
  return getRecords().find(item => item.id === String(recordId || "")) || null;
}

function saveConfirmedMetrics(metrics, options) {
  const clean = normalizeMetrics(metrics);
  if (!Object.keys(clean).length) {
    return { success: false, verified: false, errorMessage: "没有可写入的身体数据" };
  }
  const recordId = `body-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const recordedAt = new Date().toISOString();
  const record = {
    id: recordId,
    date: fitnessStore.dateKey(),
    recordedAt,
    source: String(options && options.source || "manual"),
    metrics: clean
  };
  const records = getRecords().concat(record).slice(-365);
  userStorage.set(RECORDS_KEY, records);

  const profilePatch = buildProfilePatch(clean);
  rebuildDerivedState(records);

  const readBack = getRecords().find(item => item.id === recordId);
  const profileBack = userStorage.get(PROFILE_KEY, {});
  const storageVerified = Boolean(readBack) && Object.keys(clean).every(
    key => readBack.metrics[key] === clean[key]
  );
  const profileVerified = Object.keys(profilePatch).every(
    key => String(profileBack[key]) === profilePatch[key]
  );
  return {
    success: storageVerified && profileVerified,
    verified: storageVerified && profileVerified,
    recordId,
    record: readBack || record,
    verification: { records: storageVerified, profile: profileVerified },
    errorMessage: storageVerified && profileVerified ? "" : "身体数据写入后反查校验失败"
  };
}

function updateRecord(recordId, metrics, options) {
  const id = String(recordId || "");
  const records = getRecords();
  const index = records.findIndex(item => item.id === id);
  if (index < 0) {
    return { success: false, verified: false, errorMessage: "未找到要更新的身体数据记录" };
  }
  const patch = normalizeMetrics(metrics);
  if (!Object.keys(patch).length) {
    return { success: false, verified: false, errorMessage: "没有可更新的身体数据" };
  }
  const current = records[index];
  const nextRecord = Object.assign({}, current, {
    source: String(options && options.source || current.source || "manual"),
    updatedAt: new Date().toISOString(),
    metrics: Object.assign({}, current.metrics || {}, patch)
  });
  const nextRecords = records.slice();
  nextRecords[index] = nextRecord;
  userStorage.set(RECORDS_KEY, nextRecords);
  rebuildDerivedState(nextRecords);
  const readBack = getRecordById(id);
  const verified = Boolean(readBack) && Object.keys(patch).every(
    key => readBack.metrics[key] === nextRecord.metrics[key]
  );
  return {
    success: verified,
    verified,
    recordId: id,
    record: readBack || nextRecord,
    errorMessage: verified ? "" : "身体数据更新后校验失败"
  };
}

function deleteRecord(recordId) {
  const id = String(recordId || "");
  const records = getRecords();
  const nextRecords = records.filter(item => item.id !== id);
  if (nextRecords.length === records.length) {
    return { success: false, verified: false, errorMessage: "未找到要删除的身体数据记录" };
  }
  userStorage.set(RECORDS_KEY, nextRecords);
  rebuildDerivedState(nextRecords);
  const verified = !getRecordById(id);
  return {
    success: verified,
    verified,
    recordId: id,
    errorMessage: verified ? "" : "身体数据删除后校验失败"
  };
}

function deleteRecordFields(recordId, fields) {
  const id = String(recordId || "");
  const keys = Array.isArray(fields)
    ? fields.map(item => String(item || "").trim()).filter(Boolean)
    : [];
  if (!keys.length) {
    return { success: false, verified: false, errorMessage: "缺少要删除的身体数据字段" };
  }
  const records = getRecords();
  const index = records.findIndex(item => item.id === id);
  if (index < 0) {
    return { success: false, verified: false, errorMessage: "未找到要修改的身体数据记录" };
  }
  const nextMetrics = Object.assign({}, records[index].metrics || {});
  keys.forEach(key => {
    delete nextMetrics[key];
  });
  if (!Object.keys(nextMetrics).length) {
    return deleteRecord(id);
  }
  const nextRecord = Object.assign({}, records[index], {
    updatedAt: new Date().toISOString(),
    metrics: nextMetrics
  });
  const nextRecords = records.slice();
  nextRecords[index] = nextRecord;
  userStorage.set(RECORDS_KEY, nextRecords);
  rebuildDerivedState(nextRecords);
  const readBack = getRecordById(id);
  const verified = Boolean(readBack) && keys.every(key => readBack.metrics[key] === undefined);
  return {
    success: verified,
    verified,
    recordId: id,
    record: readBack || nextRecord,
    errorMessage: verified ? "" : "身体数据字段删除后校验失败"
  };
}

function getChangeText(current, previous, unit) {
  if (current === null || current === undefined) return "暂无记录，点击添加";
  if (previous === null || previous === undefined) return "首次记录";
  const delta = round(current - previous, 1);
  if (!delta) return "与上次记录持平";
  return `较上次${delta > 0 ? "上升" : "下降"} ${Math.abs(delta)}${unit || ""}`;
}

function getStatus(field, value) {
  if (value === null || value === undefined) return "待记录";
  if (field.key === "bmi") {
    if (value < 18.5) return "偏低";
    if (value < 24) return "正常";
    if (value < 28) return "偏高";
    return "较高";
  }
  if (field.key === "visceralFatLevel") return value <= 9 ? "正常" : "需关注";
  return "已记录";
}

function getMetricViewModel() {
  const records = getRecords();
  const latest = getLatestRecord();
  const previous = records.length > 1 ? records[records.length - 2] : null;
  const latestMetrics = latest && latest.metrics || {};
  const previousMetrics = previous && previous.metrics || {};
  const items = FIELD_DEFINITIONS.map(field => {
    const value = latestMetrics[field.key];
    return Object.assign({}, field, {
      value: value === undefined ? "--" : value,
      hasValue: value !== undefined,
      status: getStatus(field, value),
      changeText: getChangeText(value, previousMetrics[field.key], field.unit)
    });
  });
  return {
    latest,
    basic: items.filter(item => item.section === "basic"),
    composition: items.filter(item => item.section === "composition"),
    circumference: items.filter(item => item.section === "circumference")
  };
}

function getSevenDayInsights() {
  if (typeof wx === "undefined") {
    return {
      averageCalories: 0,
      averageProtein: 0,
      averageExercise: 0,
      weightChange: 0,
      recordedNutritionDays: 0
    };
  }
  const today = new Date();
  let calories = 0;
  let protein = 0;
  let exercise = 0;
  let nutritionDays = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
    const dateValue = fitnessStore.dateKey(date);
    const nutrition = fitnessStore.getNutritionSummary(dateValue);
    const workout = fitnessStore.getWorkoutSummary(dateValue);
    if (nutrition.totalCalories > 0) {
      calories += nutrition.totalCalories;
      protein += nutrition.totalProtein;
      nutritionDays += 1;
    }
    exercise += workout.caloriesBurned || 0;
  }
  const weights = fitnessStore.getWeightHistory().slice(-7);
  const weightChange = weights.length > 1
    ? round(Number(weights[weights.length - 1].value) - Number(weights[0].value), 1)
    : 0;
  return {
    averageCalories: nutritionDays ? Math.round(calories / nutritionDays) : 0,
    averageProtein: nutritionDays ? round(protein / nutritionDays, 1) : 0,
    averageExercise: Math.round(exercise / 7),
    weightChange,
    recordedNutritionDays: nutritionDays
  };
}

module.exports = {
  RECORDS_KEY,
  BODY_FIELD_ALIASES,
  FIELD_DEFINITIONS,
  normalizeMetrics,
  parseBodyMetricsText,
  getRecords,
  getRecordById,
  getLatestRecord,
  getMetricViewModel,
  getSevenDayInsights,
  saveConfirmedMetrics,
  updateRecord,
  deleteRecord,
  deleteRecordFields
};
