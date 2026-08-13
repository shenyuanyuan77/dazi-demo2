const userStorage = require("./user_storage.js");
const nutritionHelper = require("../../../helper/nutrition_helper.js");
const fitnessStore = require("../store/fitness_store.js");
const writeConstraints = require("./ai_write_constraints.js");

const DRAFTS_KEY = "fitness_ai_write_drafts";
const DIET_KEY = "fitness_diet_records";
const TRAINING_KEY = "fitness_training_plan";
const TEMPLATE_KEY = "fitness_training_templates";
const WEEKLY_PLAN_KEY = "fitness_weekly_training_plans";

function now() {
  return new Date().toISOString();
}

function transition(draft, status, patch) {
  const timestamp = now();
  const history = (draft.statusHistory || []).concat({ status, at: timestamp });
  return Object.assign({}, draft, patch || {}, {
    status,
    updatedAt: timestamp,
    statusHistory: history
  });
}

function saveDraft(draft) {
  const drafts = userStorage.get(DRAFTS_KEY, {});
  drafts[draft.id] = draft;
  userStorage.set(DRAFTS_KEY, drafts);
  return draft;
}

function getDraft(id) {
  return userStorage.get(DRAFTS_KEY, {})[id] || null;
}

function normalizeFood(item, index) {
  const value = nutritionHelper.normalizeNutritionItem(item);
  const invalidFields = ["amount", "calories", "carbs", "protein", "fat"]
    .filter(key => item[key] !== "" && item[key] !== undefined && Number(item[key]) < 0);
  return Object.assign({}, value, {
    id: item.id || `food-${index + 1}`,
    name: String(item.name || `食物 ${index + 1}`),
    amount: Math.max(0, Number(item.amount) || 1),
    unit: String(item.unit || "份"),
    confidence: item.confidence === undefined
      ? null
      : Math.max(0, Math.min(1, Number(item.confidence) || 0)),
    validationErrors: invalidFields.map(key => `${key}不能为负数`)
  });
}

function isValidDateKey(value) {
  return writeConstraints.isValidDateKey(value);
}

function createDraftFromProposal(proposal, sourceMessageId) {
  const source = proposal && proposal.payload || {};
  const recognition = source.recognition || {};
  const isFood = proposal.type === "dietLog";
  const isWorkout = proposal.type === "workoutPlan";
  const id = String(proposal.id || `draft-${Date.now()}`);
  const existing = getDraft(id);
  if (existing) return existing;

  const type = isFood
    ? "food_log"
    : (isWorkout ? "workout_plan" : "nutrition_target_update");

  const payload = isFood ? {
        date: proposal.uiDate || source.date || fitnessStore.dateKey(),
        mealType: proposal.uiMeal || source.meal || "",
        foods: (source.items || []).map(normalizeFood),
        operation: source.operation || "create",
        replaceMeal: Boolean(source.replaceMeal),
        allowEmpty: Boolean(source.allowEmpty)
      }
    : (isWorkout ? Object.assign({}, source, {
        date: proposal.uiDate || source.date || fitnessStore.dateKey(),
        writeMode: source.writeMode || proposal.uiWriteMode || "append",
        operation: source.operation || "create"
      }) : {
        operation: source.operation || "create",
        recordId: source.recordId || "",
        fields: Array.isArray(source.fields) ? source.fields.slice() : [],
        profilePatch: Object.assign({}, source.profilePatch || source)
      });

  const draft = {
    id,
    type,
    status: "draft",
    sourceMessageId: String(
      recognition.sourceMessageId || source.sourceMessageId || sourceMessageId || ""
    ),
    createdAt: now(),
    updatedAt: now(),
    targetModule: isFood ? "diet" : (isWorkout ? "training" : "profile"),
    targetLocation: isFood
      ? payload.mealType
      : (isWorkout ? payload.writeMode : (payload.operation || "profile")),
    summary: String(proposal.summary || ""),
    payload,
    validationErrors: [],
    statusHistory: [{ status: "draft", at: now() }]
  };
  return saveDraft(transition(draft, "pending_confirmation"));
}

function detectAIWriteIntent(message, attachments) {
  const text = String(message || "");
  if (/(不用|不要|无需|别).{0,4}(记录|写入|保存)|只.{0,4}(分析|看看|建议)/.test(text)) {
    return "";
  }
  if (/(训练计划|今天练|动作|组数|哑铃|居家训练|一周训练)/.test(text)) {
    return "workout_plan";
  }
  if (/(调整训练|修改计划|膝盖|伤痛|生理期)/.test(text)) {
    return "workout_adjustment";
  }
  if ((attachments || []).length || /(吃了|早餐|午餐|晚餐|加餐|热量|营养|食物|饮食|高蛋白)/.test(text)) {
    return "food_log";
  }
  return "";
}

function generateFoodLogDraft(aiResult, userContext) {
  const proposal = Object.assign({}, aiResult || {}, {
    type: "dietLog",
    uiDate: aiResult && aiResult.uiDate || fitnessStore.dateKey(),
    uiMeal: aiResult && aiResult.uiMeal || ""
  });
  return createDraftFromProposal(proposal, userContext && userContext.sourceMessageId);
}

function generateWorkoutPlanDraft(aiResult, userContext) {
  const proposal = Object.assign({}, aiResult || {}, {
    type: "workoutPlan",
    uiDate: aiResult && aiResult.uiDate || fitnessStore.dateKey(),
    uiWriteMode: aiResult && aiResult.uiWriteMode || "append"
  });
  return createDraftFromProposal(proposal, userContext && userContext.sourceMessageId);
}

function validateAIWriteDraft(draft) {
  if (!draft) return ["草稿不存在"];
  const payload = draft.payload || {};
  if (draft.type === "food_log") {
    return writeConstraints.validateFoodDraftPayload(payload, draft.sourceMessageId);
  }
  if (draft.type === "workout_plan") {
    return writeConstraints.validateWorkoutDraftPayload(payload);
  }
  if (draft.type === "nutrition_target_update") {
    return writeConstraints.validateProfileDraftPayload(payload);
  }
  return [];
}

function confirmAIWriteDraft(draftId, targetLocation, payloadPatch) {
  let draft = getDraft(draftId);
  if (!draft) throw new Error("草稿不存在");
  if (draft.status === "success" || draft.status === "cancelled") return draft;
  draft = Object.assign({}, draft, {
    targetLocation: targetLocation || draft.targetLocation,
    payload: Object.assign({}, draft.payload, payloadPatch || {})
  });
  const validationErrors = validateAIWriteDraft(draft);
  draft.validationErrors = validationErrors;
  if (validationErrors.length) return saveDraft(draft);
  return saveDraft(transition(draft, "confirmed"));
}

function mealEntries(dateRecord) {
  return Object.keys(dateRecord || {}).reduce((items, key) => (
    items.concat(Array.isArray(dateRecord[key]) ? dateRecord[key] : [])
  ), []);
}

function writeFood(draft) {
  const payload = draft.payload;
  const records = userStorage.get(DIET_KEY, {});
  const dateRecord = records[payload.date] || {};
  const foods = (payload.foods || []).map((item, index) => {
    const normalized = nutritionHelper.normalizeNutritionItem(item);
    delete normalized.validationErrors;
    return Object.assign({}, normalized, {
      id: item.id || `${draft.id}-${index}`,
      name: item.name,
      amount: item.amount,
      unit: item.unit,
      source: "ai",
      aiDraftId: draft.id
    });
  });

  if (payload.operation === "delete" || payload.replaceMeal) {
    if (foods.length) {
      dateRecord[payload.mealType] = foods;
    } else {
      delete dateRecord[payload.mealType];
    }
  } else {
    const current = dateRecord[payload.mealType] || [];
    const existing = current.filter(item => item.aiDraftId === draft.id);
    dateRecord[payload.mealType] = existing.length === foods.length
      ? current
      : current.filter(item => item.aiDraftId !== draft.id).concat(foods);
  }

  if (Object.keys(dateRecord).length) {
    records[payload.date] = dateRecord;
  } else {
    delete records[payload.date];
  }
  userStorage.set(DIET_KEY, records);

  const readBack = userStorage.get(DIET_KEY, {});
  const writtenMeal = ((readBack[payload.date] || {})[payload.mealType] || []);
  const written = (payload.operation === "delete" || payload.replaceMeal)
    ? writtenMeal
    : writtenMeal.filter(item => item.aiDraftId === draft.id);
  const expected = nutritionHelper.summarizeNutrition(foods);
  const actual = nutritionHelper.summarizeNutrition(written);
  const storageVerified = written.length === foods.length &&
    actual.calories === expected.calories &&
    actual.carbs === expected.carbs &&
    actual.protein === expected.protein &&
    actual.fat === expected.fat;

  const summary = fitnessStore.getNutritionSummary(payload.date);
  const expectedDaySummary = nutritionHelper.summarizeNutrition(
    mealEntries(readBack[payload.date] || {})
  );
  const storeVerified = summary.totalCalories === expectedDaySummary.calories &&
    summary.totalCarbs === expectedDaySummary.carbs &&
    summary.totalProtein === expectedDaySummary.protein &&
    summary.totalFat === expectedDaySummary.fat;

  let dashboardVerified = true;
  if (payload.date === fitnessStore.dateKey()) {
    const dashboard = require("./dashboard_service.js").getDashboardData();
    dashboardVerified = dashboard.calories.consumed === summary.totalCalories;
  }

  const fullyVerified = storageVerified && storeVerified && dashboardVerified;
  return {
    success: fullyVerified,
    recordId: draft.id,
    verified: fullyVerified,
    verification: { storage: storageVerified, store: storeVerified, dashboard: dashboardVerified },
    errorMessage: fullyVerified ? "" : "饮食记录写入后校验失败"
  };
}

function normalizeExercise(exercise, exerciseIndex, draftId) {
  const base = Date.now() + exerciseIndex * 100;
  return {
    id: exercise.id || `${draftId}-${exerciseIndex}`,
    name: String(exercise.name || "自定义动作"),
    subtitle: String(exercise.subtitle || exercise.instruction || ""),
    expanded: true,
    muscles: exercise.muscleGroups || exercise.muscles || [],
    sets: (exercise.sets || []).map((set, setIndex) => ({
      id: set.id || base + setIndex + 1,
      setIndex: Number(set.setIndex) || setIndex + 1,
      weight: set.weight === undefined ? "" : String(set.weight),
      reps: set.reps === undefined ? "10" : String(set.reps),
      restSeconds: Math.max(0, Number(set.restSeconds) || 60),
      completed: false,
      done: false
    })),
    aiDraftId: draftId
  };
}

function writeWorkout(draft) {
  const payload = draft.payload;

  if (payload.operation === "delete" || payload.writeMode === "delete") {
    const plans = userStorage.get(TRAINING_KEY, {});
    delete plans[payload.date];
    userStorage.set(TRAINING_KEY, plans);
    const verified = !Array.isArray((userStorage.get(TRAINING_KEY, {}) || {})[payload.date]);
    return { success: verified, recordId: draft.id, verified, verification: { storage: verified, store: true, dashboard: true } };
  }

  const exercises = payload.exercises.map((item, index) => (
    normalizeExercise(item, index, draft.id)
  ));

  if (payload.writeMode === "template") {
    const templates = userStorage.get(TEMPLATE_KEY, []);
    const template = {
      id: draft.id,
      name: payload.planName || draft.summary || "AI 训练模板",
      exercises
    };
    userStorage.set(
      TEMPLATE_KEY,
      templates.filter(item => item.id !== draft.id).concat(template)
    );
    const verified = userStorage.get(TEMPLATE_KEY, []).some(item => item.id === draft.id);
    return { success: verified, recordId: draft.id, verified };
  }

  if (payload.writeMode === "week") {
    const weeklyPlans = userStorage.get(WEEKLY_PLAN_KEY, []);
    const plan = {
      id: draft.id,
      name: payload.planName || draft.summary || "AI 本周训练计划",
      startDate: payload.date,
      goal: payload.goal || "",
      exercises
    };
    userStorage.set(
      WEEKLY_PLAN_KEY,
      weeklyPlans.filter(item => item.id !== draft.id).concat(plan)
    );
    const verified = userStorage.get(WEEKLY_PLAN_KEY, []).some(item => item.id === draft.id);
    return { success: verified, recordId: draft.id, verified };
  }

  const plans = userStorage.get(TRAINING_KEY, {});
  const current = Array.isArray(plans[payload.date]) ? plans[payload.date] : [];
  plans[payload.date] = payload.writeMode === "replace"
    ? exercises
    : current.filter(item => item.aiDraftId !== draft.id).concat(exercises);
  userStorage.set(TRAINING_KEY, plans);

  const readBack = userStorage.get(TRAINING_KEY, {})[payload.date] || [];
  const written = payload.writeMode === "replace"
    ? readBack
    : readBack.filter(item => item.aiDraftId === draft.id);
  const expectedSets = exercises.reduce((sum, item) => sum + item.sets.length, 0);
  const actualSets = written.reduce((sum, item) => sum + item.sets.length, 0);
  const storageVerified = written.length === exercises.length && actualSets === expectedSets;

  const workoutSummary = fitnessStore.getWorkoutSummary(payload.date);
  const storeVerified = exercises.every(expected => (
    workoutSummary.exercises.some(actual => (
      actual.name === expected.name &&
      actual.sets.length === expected.sets.length
    ))
  ));

  let dashboardVerified = true;
  if (payload.date === fitnessStore.dateKey()) {
    const dashboard = require("./dashboard_service.js").getDashboardData();
    dashboardVerified = dashboard.tasks.some(task => task.type === "training");
  }

  const fullyVerified = storageVerified && storeVerified && dashboardVerified;
  return {
    success: fullyVerified,
    recordId: draft.id,
    verified: fullyVerified,
    verification: { storage: storageVerified, store: storeVerified, dashboard: dashboardVerified },
    errorMessage: fullyVerified ? "" : "训练计划写入后校验失败"
  };
}

function writeProfile(draft) {
  const payload = draft.payload || {};
  const source = payload.profilePatch || payload || {};
  const bodyMetricsService = require("./body_metrics_service.js");
  if (payload.operation === "delete") {
    return bodyMetricsService.deleteRecord(payload.recordId);
  }
  if (payload.operation === "delete_fields") {
    return bodyMetricsService.deleteRecordFields(payload.recordId, payload.fields || Object.keys(source));
  }
  if (payload.operation === "update") {
    return bodyMetricsService.updateRecord(payload.recordId, source, { source: "ai" });
  }
  const result = bodyMetricsService.saveConfirmedMetrics(source, { source: "ai" });
  return Object.assign({}, result, {
    recordId: result.recordId || draft.id
  });
}

function executeAIWriteDraft(draftId) {
  let draft = getDraft(draftId);
  if (!draft) throw new Error("草稿不存在");
  if (draft.status === "success") return draft;
  if (draft.status === "cancelled") return draft;

  const validationErrors = validateAIWriteDraft(draft);
  if (validationErrors.length) {
    return saveDraft(transition(draft, "failed", {
      validationErrors,
      writeResult: {
        success: false,
        verified: false,
        errorMessage: validationErrors.join("；")
      }
    }));
  }

  if (draft.status !== "confirmed" && draft.status !== "failed") {
    return saveDraft(transition(draft, "failed", {
      writeResult: {
        success: false,
        verified: false,
        errorMessage: "草稿尚未由用户确认"
      }
    }));
  }

  draft = saveDraft(transition(draft, "writing"));
  try {
    const result = draft.type === "food_log"
      ? writeFood(draft)
      : (draft.type === "workout_plan" ? writeWorkout(draft) : writeProfile(draft));
    if (!result.success || !result.verified || !result.recordId) {
      return saveDraft(transition(draft, "failed", { writeResult: result }));
    }
    return saveDraft(transition(draft, "success", { writeResult: result }));
  } catch (error) {
    return saveDraft(transition(draft, "failed", {
      writeResult: {
        success: false,
        verified: false,
        errorMessage: String(error && error.message || "本地存储失败")
      }
    }));
  }
}

function retryAIWriteDraft(draftId) {
  let draft = getDraft(draftId);
  if (!draft) throw new Error("草稿不存在");
  if (draft.status === "success" || draft.status === "cancelled") return draft;
  if (draft.status !== "failed") return draft;
  draft = saveDraft(transition(draft, "confirmed", {
    validationErrors: [],
    writeResult: null
  }));
  return executeAIWriteDraft(draft.id);
}

function cancelAIWriteDraft(draftId) {
  const draft = getDraft(draftId);
  if (!draft) return null;
  if (draft.status === "success" || draft.status === "cancelled") return draft;
  return saveDraft(transition(draft, "cancelled"));
}

function cancelPendingFoodDraftsExcept(sourceMessageId) {
  const drafts = userStorage.get(DRAFTS_KEY, {});
  let changed = false;
  Object.keys(drafts).forEach(id => {
    const draft = drafts[id];
    if (
      draft &&
      draft.type === "food_log" &&
      draft.sourceMessageId !== String(sourceMessageId || "") &&
      ["draft", "pending_confirmation", "confirmed", "failed"].includes(draft.status)
    ) {
      drafts[id] = transition(draft, "cancelled", {
        writeResult: {
          success: false,
          verified: false,
          errorMessage: "新的食物识别已开始，旧草稿已失效"
        }
      });
      changed = true;
    }
  });
  if (changed) userStorage.set(DRAFTS_KEY, drafts);
}

function verifyAIWriteResult(draftId) {
  const draft = getDraft(draftId);
  return Boolean(
    draft &&
    draft.status === "success" &&
    draft.writeResult &&
    draft.writeResult.success &&
    draft.writeResult.verified &&
    draft.writeResult.recordId
  );
}

module.exports = {
  DRAFTS_KEY,
  detectAIWriteIntent,
  generateFoodLogDraft,
  generateWorkoutPlanDraft,
  createDraftFromProposal,
  validateAIWriteDraft,
  confirmAIWriteDraft,
  executeAIWriteDraft,
  retryAIWriteDraft,
  cancelAIWriteDraft,
  cancelPendingFoodDraftsExcept,
  verifyAIWriteResult,
  getDraft,
  isValidDateKey
};
