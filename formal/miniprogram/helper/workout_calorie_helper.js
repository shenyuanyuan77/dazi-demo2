const exerciseLibrary = require("../projects/dazi/biz/exercise_library.js");

const DEFAULT_WEIGHT_KG = 70;

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function calculateAge(birthday) {
  if (!birthday) return 0;
  const birth = new Date(`${birthday}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return 0;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDelta = today.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) age -= 1;
  return Math.max(0, age);
}

function inspectUserProfile(userProfile) {
  const source = userProfile || {};
  const missingFields = [];
  if (!(Number(source.currentWeight) > 0)) missingFields.push("体重");
  if (!(Number(source.height) > 0)) missingFields.push("身高");
  if (!source.gender || source.gender === "未设置") missingFields.push("性别");
  if (!source.birthday) missingFields.push("生日");
  if (!source.goal) missingFields.push("当前目标");
  return {
    weight: positiveNumber(source.currentWeight, DEFAULT_WEIGHT_KG),
    height: positiveNumber(source.height, 170),
    gender: source.gender || "未设置",
    age: calculateAge(source.birthday),
    goal: source.goal || "塑形",
    missingFields
  };
}

function calculateExerciseCalories({ met, weight, durationMinutes }) {
  const safeMet = positiveNumber(met, exerciseLibrary.DEFAULT_EXERCISE.met);
  const safeWeight = positiveNumber(weight, DEFAULT_WEIGHT_KG);
  const safeMinutes = Math.max(0, Number(durationMinutes) || 0);
  return Math.round(safeMet * safeWeight * (safeMinutes / 60) * 10) / 10;
}

function estimateSetDurationMinutes(set, config) {
  const reps = positiveNumber(set && set.reps, 10);
  return Math.max(0.5, reps * positiveNumber(config.secondsPerRep, 4) / 60);
}

function normalizeSet(set, fallbackId) {
  const source = set || {};
  const completed = Boolean(
    source.completed !== undefined ? source.completed : source.done
  );
  return Object.assign({}, source, {
    id: source.id || fallbackId,
    weight: String(source.weight || ""),
    reps: String(source.reps || ""),
    completed,
    done: completed,
    completedAt: completed ? (source.completedAt || 0) : 0
  });
}

function normalizeExercise(exercise, index) {
  const source = exercise || {};
  const config = exerciseLibrary.getExerciseConfig(source.name || source.subtitle);
  const sets = (Array.isArray(source.sets) ? source.sets : []).map((set, setIndex) => (
    normalizeSet(set, Date.now() + index * 100 + setIndex)
  ));
  return Object.assign({}, source, {
    id: source.id || Date.now() + index,
    name: config.name === "力量训练"
      ? String(source.name || "自定义动作")
      : config.name,
    type: source.type || config.type,
    met: positiveNumber(source.met, config.met),
    muscles: Array.isArray(source.muscles) && source.muscles.length
      ? source.muscles
      : config.muscles,
    expanded: source.expanded !== false,
    sets
  });
}

function calculateWorkoutCalories({ exercises, userProfile, elapsedMinutes }) {
  const source = (Array.isArray(exercises) ? exercises : []).map(normalizeExercise);
  const profile = inspectUserProfile(userProfile);
  const weight = profile.weight;
  const completedExercises = source.map(exercise => {
    const config = exerciseLibrary.getExerciseConfig(exercise.name);
    const completedSets = exercise.sets.filter(set => set.completed);
    const estimatedActiveMinutes = completedSets.reduce((sum, set) => (
      sum + estimateSetDurationMinutes(set, config)
    ), 0);
    const durationMinutes = positiveNumber(
      exercise.durationMinutes,
      estimatedActiveMinutes
    );
    const calories = calculateExerciseCalories({
      met: exercise.met || config.met,
      weight,
      durationMinutes
    });
    return Object.assign({}, exercise, {
      completedSets: completedSets.length,
      totalSets: exercise.sets.length,
      completed: exercise.sets.length > 0 && completedSets.length === exercise.sets.length,
      durationMinutes: Math.round(durationMinutes * 10) / 10,
      calories
    });
  });

  const estimatedDuration = completedExercises.reduce(
    (sum, exercise) => sum + exercise.durationMinutes,
    0
  );
  const totalDuration = estimatedDuration;
  const estimatedCalories = completedExercises.reduce(
    (sum, exercise) => sum + exercise.calories,
    0
  );
  const totalCalories = Math.round(estimatedCalories);
  const muscleSet = new Set();
  completedExercises.forEach(exercise => {
    if (!exercise.completedSets) return;
    exercise.muscles.forEach(muscle => muscleSet.add(muscle));
  });

  return {
    exercises: completedExercises,
    totalCalories,
    durationMinutes: Math.round(totalDuration),
    completedExercises: completedExercises.filter(item => item.completed).length,
    completedSets: completedExercises.reduce((sum, item) => sum + item.completedSets, 0),
    totalSets: completedExercises.reduce((sum, item) => sum + item.totalSets, 0),
    muscles: Array.from(muscleSet),
    usedDefaultWeight: !(userProfile && Number(userProfile.currentWeight) > 0),
    profile
  };
}

module.exports = {
  DEFAULT_WEIGHT_KG,
  calculateExerciseCalories,
  calculateWorkoutCalories,
  estimateSetDurationMinutes,
  inspectUserProfile,
  normalizeExercise,
  normalizeSet
};
