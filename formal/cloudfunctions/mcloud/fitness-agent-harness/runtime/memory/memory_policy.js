const { PendingWriteType } = require("../../shared/types/agent_types.js");

const MEMORY_POLICY = Object.freeze({
  userProfile: [
    "heightCm",
    "weightKg",
    "goal",
    "dailyCalorieTarget",
    "dietPreferences",
    "dietAvoidances",
    "trainingFrequency",
    "availableEquipment",
    "weeklySchedule",
    "injuryHistory"
  ],
  episodicTargets: {
    dietLogs: PendingWriteType.DIET_LOG,
    trainingLogs: PendingWriteType.TRAINING_LOG,
    trainingPlans: PendingWriteType.TRAINING_PLAN,
    bodyMetrics: PendingWriteType.BODY_METRIC
  },
  sessionOnly: [
    "temporaryClarification",
    "toolResult",
    "formatRepair",
    "unsupportedQuestion"
  ],
  forbiddenLongTerm: [
    "toolFailure",
    "validationError",
    "unsupportedQuestion",
    "smallTalk",
    "unconfirmedWrite"
  ]
});

function classifyMemoryUpdate(pendingWrite) {
  if (!pendingWrite) return [];
  if (pendingWrite.type === PendingWriteType.USER_PROFILE) {
    return [{
      target: "userProfile",
      action: "pending_update",
      data: pendingWrite.data,
      requiresConfirmation: true
    }];
  }
  if (pendingWrite.type === PendingWriteType.DIET_LOG) {
    return [{ target: "dietLogs", action: "pending_create", data: pendingWrite.data, requiresConfirmation: true }];
  }
  if (pendingWrite.type === PendingWriteType.TRAINING_LOG) {
    return [{ target: "trainingLogs", action: "pending_create", data: pendingWrite.data, requiresConfirmation: true }];
  }
  if (pendingWrite.type === PendingWriteType.TRAINING_PLAN) {
    return [{ target: "trainingPlans", action: "pending_upsert", data: pendingWrite.data, requiresConfirmation: true }];
  }
  if (pendingWrite.type === PendingWriteType.BODY_METRIC) {
    return [{ target: "bodyMetrics", action: "pending_create", data: pendingWrite.data, requiresConfirmation: true }];
  }
  return [];
}

module.exports = {
  MEMORY_POLICY,
  classifyMemoryUpdate
};
