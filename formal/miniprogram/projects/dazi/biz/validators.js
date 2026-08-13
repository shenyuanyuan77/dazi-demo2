const SUPPORTED_PROPOSAL_TYPES = ["dietLog", "workoutPlan", "profilePatch"];

const WORKOUT_PROPOSAL_INTENTS = new Set([
  "workout_plan_generation",
  "workout_plan_update",
  "workout_plan_delete",
  "workout_log_record",
  "modify_pending_proposal"
]);

const DIET_PROPOSAL_INTENTS = new Set([
  "food_log_write",
  "diet_record_update",
  "diet_record_delete"
]);

const PROFILE_PROPOSAL_INTENTS = new Set([
  "body_data_recognition",
  "body_data_update",
  "body_data_delete",
  "profile_goal_update"
]);

const NO_PROPOSAL_INTENTS = new Set([
  "meal_plan_generation",
  "food_analysis_only",
  "body_status_evaluation",
  "body_data_query",
  "diet_record_query",
  "workout_plan_query",
  "calorie_gap_evaluation",
  "nutrition_knowledge_qa",
  "fitness_knowledge_qa",
  "general_status_summary",
  "unsupported",
  "out_of_scope",
  "ambiguous"
]);

function getAllowedProposalTypes(intentResult = {}) {
  const intent = String(intentResult.intent || "");
  if (WORKOUT_PROPOSAL_INTENTS.has(intent)) return ["workoutPlan"];
  if (DIET_PROPOSAL_INTENTS.has(intent)) return ["dietLog"];
  if (PROFILE_PROPOSAL_INTENTS.has(intent)) return ["profilePatch"];
  if (NO_PROPOSAL_INTENTS.has(intent)) return [];
  return SUPPORTED_PROPOSAL_TYPES.slice();
}

function proposalTypeMatchesIntent(intentResult, proposalType) {
  return getAllowedProposalTypes(intentResult).includes(String(proposalType || ""));
}

function hasInvalidExerciseName(name) {
  const value = String(name || "").trim();
  if (!value) return true;
  if (/^(我想|我是说|改成|改为|换成|每个项目|每个动作|每一项|不要|去掉|删掉|保存到|安排到|把刚才|帮我|今天练|还是改成)/.test(value)) {
    return true;
  }
  if (value.length > 10 && /(训练计划|饮食记录|身体分析|保存|明天)/.test(value)) {
    return true;
  }
  if (value.length > 8 && /\d+\s*(组|次|分钟)/.test(value)) {
    return true;
  }
  return false;
}

function sanitizeWorkoutExercises(exercises) {
  return (Array.isArray(exercises) ? exercises : [])
    .filter(item => item && !hasInvalidExerciseName(item.name))
    .map(item => Object.assign({}, item, {
      sets: (Array.isArray(item.sets) ? item.sets : []).map((set, index) => Object.assign({}, set, {
        setIndex: Number(set.setIndex) || index + 1
      }))
    }));
}

function filterProposalList(intentResult, proposals) {
  const allowed = getAllowedProposalTypes(intentResult);
  return (Array.isArray(proposals) ? proposals : [])
    .filter(item => item && SUPPORTED_PROPOSAL_TYPES.includes(item.type))
    .filter(item => !allowed.length || allowed.includes(item.type))
    .map(item => {
      if (item.type !== "workoutPlan") return item;
      const payload = Object.assign({}, item.payload || {});
      return Object.assign({}, item, {
        payload: Object.assign({}, payload, {
          exercises: sanitizeWorkoutExercises(payload.exercises)
        })
      });
    })
    .filter(item => {
      const payload = item.payload || {};
      if (item.type === "dietLog") {
        if (payload.operation === "delete") return true;
        return Array.isArray(payload.items);
      }
      if (item.type === "workoutPlan") {
        if (payload.operation === "delete") return true;
        return Array.isArray(payload.exercises) && payload.exercises.length > 0;
      }
      if (payload.operation === "delete") return true;
      return payload.profilePatch && Object.keys(payload.profilePatch).length > 0;
    });
}

function validateWorkoutExercises(exercises) {
  const errors = [];
  (Array.isArray(exercises) ? exercises : []).forEach(exercise => {
    if (hasInvalidExerciseName(exercise && exercise.name)) {
      errors.push(`训练动作名称无效：${String(exercise && exercise.name || "未命名动作")}`);
    }
  });
  return Array.from(new Set(errors));
}

module.exports = {
  SUPPORTED_PROPOSAL_TYPES,
  filterProposalList,
  getAllowedProposalTypes,
  hasInvalidExerciseName,
  proposalTypeMatchesIntent,
  sanitizeWorkoutExercises,
  validateWorkoutExercises
};
