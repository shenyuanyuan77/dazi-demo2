const { AgentIntent } = require("../../shared/types/agent_types.js");

const CONTEXT_POLICY = Object.freeze({
  [AgentIntent.DIET_RECORD]: ["shortTermMemory", "todayDietLogs"],
  [AgentIntent.DIET_SUGGESTION]: ["userProfile", "todayDietLogs", "todayTrainingLogs", "currentGoal"],
  [AgentIntent.TRAINING_PLAN_CREATE]: ["userProfile", "currentGoal", "availableEquipment", "weeklySchedule", "injuryHistory"],
  [AgentIntent.TRAINING_RECORD]: ["todayTrainingPlan", "recentTrainingLogs"],
  [AgentIntent.TRAINING_PLAN_UPDATE]: ["todayTrainingPlan", "recentTrainingPlans", "weeklySchedule"],
  [AgentIntent.BODY_ANALYSIS]: ["userProfile", "latestBodyMetrics", "bodyMetricTrend"],
  [AgentIntent.CONFIRM_WRITE]: ["pendingWrite"],
  [AgentIntent.CANCEL_WRITE]: ["pendingWrite"],
  [AgentIntent.UNSUPPORTED]: ["proceduralMemory"]
});

function selectContext(intent, state, episodic) {
  const keys = CONTEXT_POLICY[intent] || [];
  const profile = state.userProfile || {};
  const data = {
    shortTermMemory: state.shortTermMemory || [],
    userProfile: profile,
    todayDietLogs: (episodic && episodic.dietLogs || []).slice(-6),
    todayTrainingLogs: (episodic && episodic.trainingLogs || []).slice(-6),
    recentTrainingLogs: (episodic && episodic.trainingLogs || []).slice(-10),
    recentTrainingPlans: state.trainingPlans || [],
    todayTrainingPlan: state.todayTrainingPlan || null,
    latestBodyMetrics: (episodic && episodic.bodyMetrics || []).slice(-3),
    bodyMetricTrend: { count: (episodic && episodic.bodyMetrics || []).length },
    currentGoal: profile.goal || "",
    availableEquipment: profile.availableEquipment || "",
    weeklySchedule: profile.weeklySchedule || "",
    injuryHistory: profile.injuryHistory || "",
    pendingWrite: state.pendingWrite || null,
    proceduralMemory: state.proceduralMemory || []
  };
  const selected = {};
  keys.forEach(key => {
    if (data[key] !== undefined && data[key] !== "" && data[key] !== null) selected[key] = data[key];
  });
  return {
    keys,
    data: selected
  };
}

module.exports = {
  CONTEXT_POLICY,
  selectContext
};
