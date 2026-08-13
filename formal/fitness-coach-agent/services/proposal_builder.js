const { INVALID_EXERCISE_NAME_PATTERN } = require("../validators/validate_workout_plan.js");

function todayKey() {
  const date = new Date();
  const pad = value => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function createDietProposal({ id, date, meal = "", items = [], summary = "待确认的饮食记录" }) {
  return {
    id: id || `diet-${Date.now()}`,
    type: "dietLog",
    status: "pending",
    summary,
    payload: {
      date: date || todayKey(),
      meal,
      items: items.map(item => ({
        name: String(item.name || "图片餐食（请先修改名称）"),
        amount: Number(item.amount) || 1,
        unit: item.unit || "份",
        calories: Math.max(0, Number(item.calories) || 0),
        protein: Math.max(0, Number(item.protein) || 0),
        carbs: Math.max(0, Number(item.carbs) || 0),
        fat: Math.max(0, Number(item.fat) || 0),
        confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0.3))
      }))
    }
  };
}

function sanitizeExerciseName(name) {
  const value = String(name || "").trim();
  if (!value) return "";
  if (INVALID_EXERCISE_NAME_PATTERN.test(value)) return "";
  return value.slice(0, 24);
}

function createWorkoutProposal({ id, date, writeMode = "append", focus = "", exercises = [], summary = "待确认的训练计划" }) {
  const cleanedExercises = exercises
    .map(exercise => {
      const name = sanitizeExerciseName(exercise.name);
      if (!name) return null;
      const sets = Array.isArray(exercise.sets) && exercise.sets.length
        ? exercise.sets
        : [{ weight: "", reps: "10" }];
      return {
        name,
        subtitle: exercise.subtitle || "",
        sets: sets.map(set => ({
          weight: String(set.weight || ""),
          reps: String(set.reps || set.duration || "10"),
          restSeconds: Number(set.restSeconds) || 0
        }))
      };
    })
    .filter(Boolean);

  return {
    id: id || `workout-${Date.now()}`,
    type: "workoutPlan",
    status: "pending",
    summary,
    payload: {
      date: date || todayKey(),
      writeMode,
      focus,
      exercises: cleanedExercises.length
        ? cleanedExercises
        : [{ name: "深蹲", subtitle: "默认下肢动作，请按需修改", sets: [{ weight: "", reps: "10", restSeconds: 40 }] }]
    }
  };
}

function createProfilePatchProposal({ id, date, profilePatch = {}, summary = "待确认的身体数据更新" }) {
  return {
    id: id || `profile-${Date.now()}`,
    type: "profilePatch",
    status: "pending",
    summary,
    payload: {
      date: date || todayKey(),
      profilePatch
    }
  };
}

module.exports = {
  createDietProposal,
  createWorkoutProposal,
  createProfilePatchProposal,
  sanitizeExerciseName
};
