const { PendingWriteStatus } = require("../../shared/types/agent_types.js");
const { cloneJson, sanitizeObject } = require("../../shared/utils/object.js");
const { buildEpisodicMemory } = require("../memory/episodicMemory.js");
const { getProceduralRules } = require("../memory/proceduralMemory.js");
const { normalizeUserProfile } = require("../memory/userProfileMemory.js");

function normalizePendingWrite(pendingWrite) {
  if (!pendingWrite || typeof pendingWrite !== "object") return null;
  return {
    id: String(pendingWrite.id || ""),
    type: String(pendingWrite.type || ""),
    target: String(pendingWrite.target || ""),
    data: sanitizeObject(pendingWrite.data || {}, { maxKeys: 100, maxString: 1500 }),
    summaryForUser: String(pendingWrite.summaryForUser || "").slice(0, 300),
    status: String(pendingWrite.status || PendingWriteStatus.WAITING_CONFIRM),
    createdAt: String(pendingWrite.createdAt || ""),
    expiresAt: String(pendingWrite.expiresAt || "")
  };
}

function createInitialState(input) {
  const previous = cloneJson(input.previousState || {}, {});
  const profile = normalizeUserProfile(Object.assign(
    {},
    previous.userProfile || {},
    input.profile || {}
  ));
  const state = {
    userId: String(input.userId || previous.userId || ""),
    sessionId: String(input.sessionId || previous.sessionId || ""),
    shortTermMemory: Array.isArray(previous.shortTermMemory) ? previous.shortTermMemory.slice(-24) : [],
    userProfile: profile,
    pendingWrite: normalizePendingWrite(previous.pendingWrite),
    lastIntent: previous.lastIntent || "",
    toolCallHistory: Array.isArray(previous.toolCallHistory) ? previous.toolCallHistory.slice(-80) : [],
    memoryReadHistory: Array.isArray(previous.memoryReadHistory) ? previous.memoryReadHistory.slice(-80) : [],
    memoryWriteHistory: Array.isArray(previous.memoryWriteHistory) ? previous.memoryWriteHistory.slice(-80) : [],
    errors: Array.isArray(previous.errors) ? previous.errors.slice(-80) : [],
    proceduralMemory: getProceduralRules(),
    episodicMemory: buildEpisodicMemory(input.recentLogs || [])
  };
  return state;
}

function compactState(state) {
  return {
    userId: state.userId,
    sessionId: state.sessionId,
    shortTermMemory: (state.shortTermMemory || []).slice(-24),
    userProfile: sanitizeObject(state.userProfile || {}),
    pendingWrite: normalizePendingWrite(state.pendingWrite),
    lastIntent: state.lastIntent || "",
    toolCallHistory: (state.toolCallHistory || []).slice(-80),
    memoryReadHistory: (state.memoryReadHistory || []).slice(-80),
    memoryWriteHistory: (state.memoryWriteHistory || []).slice(-80),
    errors: (state.errors || []).slice(-80)
  };
}

function addMemoryRead(state, record) {
  state.memoryReadHistory = (state.memoryReadHistory || []).concat(Object.assign({
    at: new Date().toISOString()
  }, record || {})).slice(-80);
}

function addMemoryWrite(state, record) {
  state.memoryWriteHistory = (state.memoryWriteHistory || []).concat(Object.assign({
    at: new Date().toISOString()
  }, record || {})).slice(-80);
}

function addToolCall(state, record) {
  state.toolCallHistory = (state.toolCallHistory || []).concat(Object.assign({
    at: new Date().toISOString()
  }, record || {})).slice(-80);
}

function addError(state, error) {
  if (!error) return;
  state.errors = (state.errors || []).concat(error).slice(-80);
}

module.exports = {
  addError,
  addMemoryRead,
  addMemoryWrite,
  addToolCall,
  compactState,
  createInitialState,
  normalizePendingWrite
};
