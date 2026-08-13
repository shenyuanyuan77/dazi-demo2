const AgentIntent = Object.freeze({
  DIET_RECORD: "DIET_RECORD",
  DIET_SUGGESTION: "DIET_SUGGESTION",
  TRAINING_PLAN_CREATE: "TRAINING_PLAN_CREATE",
  TRAINING_RECORD: "TRAINING_RECORD",
  TRAINING_PLAN_UPDATE: "TRAINING_PLAN_UPDATE",
  BODY_ANALYSIS: "BODY_ANALYSIS",
  CONFIRM_WRITE: "CONFIRM_WRITE",
  CANCEL_WRITE: "CANCEL_WRITE",
  UNSUPPORTED: "UNSUPPORTED"
});

const PendingWriteType = Object.freeze({
  DIET_LOG: "diet_log",
  TRAINING_LOG: "training_log",
  TRAINING_PLAN: "training_plan",
  BODY_METRIC: "body_metric",
  USER_PROFILE: "user_profile"
});

const PendingWriteStatus = Object.freeze({
  WAITING_CONFIRM: "waiting_confirm",
  CONFIRMED: "confirmed",
  CANCELLED: "cancelled",
  FAILED: "failed",
  EXPIRED: "expired"
});

const ToolPermissionLevel = Object.freeze({
  READ: "read",
  WRITE: "write",
  SENSITIVE_WRITE: "sensitive_write"
});

const SUPPORTED_INTENTS = Object.freeze([
  AgentIntent.DIET_RECORD,
  AgentIntent.DIET_SUGGESTION,
  AgentIntent.TRAINING_PLAN_CREATE,
  AgentIntent.TRAINING_RECORD,
  AgentIntent.TRAINING_PLAN_UPDATE,
  AgentIntent.BODY_ANALYSIS
]);

module.exports = {
  AgentIntent,
  PendingWriteType,
  PendingWriteStatus,
  ToolPermissionLevel,
  SUPPORTED_INTENTS
};
