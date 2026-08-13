class AgentHarnessError extends Error {
  constructor(code, message, detail) {
    super(message);
    this.name = "AgentHarnessError";
    this.code = code;
    this.detail = detail || {};
  }
}

const ErrorCode = Object.freeze({
  INPUT_BLOCKED: "INPUT_BLOCKED",
  UNSUPPORTED_SCOPE: "UNSUPPORTED_SCOPE",
  MISSING_REQUIRED_SLOT: "MISSING_REQUIRED_SLOT",
  TOOL_FAILED: "TOOL_FAILED",
  WRITE_NOT_CONFIRMED: "WRITE_NOT_CONFIRMED",
  PENDING_WRITE_EXPIRED: "PENDING_WRITE_EXPIRED",
  FORMAT_INVALID: "FORMAT_INVALID",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  NETWORK_TIMEOUT: "NETWORK_TIMEOUT",
  OCR_FAILED: "OCR_FAILED"
});

function toAgentError(error, phase) {
  if (!error) return null;
  return {
    code: String(error.code || error.providerCode || "AGENT_ERROR"),
    message: String(error.message || error).slice(0, 300),
    phase: String(phase || ""),
    detail: error.detail || {},
    at: new Date().toISOString()
  };
}

module.exports = {
  AgentHarnessError,
  ErrorCode,
  toAgentError
};
