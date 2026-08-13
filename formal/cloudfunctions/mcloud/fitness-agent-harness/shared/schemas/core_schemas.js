const {
  AgentIntent,
  PendingWriteStatus,
  PendingWriteType,
  ToolPermissionLevel
} = require("../types/agent_types.js");

module.exports = {
  AgentIntent,
  PendingWriteStatus,
  PendingWriteType,
  ToolPermissionLevel,
  AgentTurnResultShape: {
    reply: "string",
    intent: "AgentIntent",
    slots: "Record<string, any>",
    toolCalls: "ToolCall[]",
    pendingWrite: "PendingWrite?",
    memoryUpdates: "MemoryUpdate[]",
    guardrailResult: "{ allowed: boolean, reason?: string }",
    validationResult: "{ passed: boolean, errors: string[] }",
    trace: "TraceEvent[]"
  },
  PendingWriteShape: {
    id: "string",
    type: "diet_log|training_log|training_plan|body_metric|user_profile",
    target: "string",
    data: "Record<string, any>",
    summaryForUser: "string",
    status: "waiting_confirm|confirmed|cancelled|failed|expired",
    createdAt: "ISO datetime",
    expiresAt: "ISO datetime?"
  }
};
