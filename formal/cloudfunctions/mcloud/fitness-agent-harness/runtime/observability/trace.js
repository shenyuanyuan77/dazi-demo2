// runtime/observability/trace.js
// 请求追踪与结构化日志骨架。
// 用法：
//   const trace = createTrace({ requestId, userId, sessionId });
//   trace.event('intent.recognized', { intent });
//   trace.tool('diet.analyze', { ok, durationMs });
//   trace.warning('model.timeout');
//   const lines = trace.render();   // 返回结构化 JSON 行，便于日志平台解析

const { createId } = require("../../shared/utils/id.js");

function nowIso() {
  return new Date().toISOString();
}

function safeClone(value) {
  if (value === null || value === undefined) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (err) {
    return String(value).slice(0, 240);
  }
}

function redact(value, fields) {
  if (!fields || !fields.length) return value;
  if (Array.isArray(value)) return value.map(v => redact(v, fields));
  if (value && typeof value === "object") {
    const out = {};
    Object.keys(value).forEach(k => {
      if (fields.includes(k)) {
        out[k] = "***";
      } else {
        out[k] = redact(value[k], fields);
      }
    });
    return out;
  }
  return value;
}

function createTrace(seed) {
  const events = [];
  const counters = { tools: 0, models: 0, errors: 0 };
  const requestId = (seed && seed.requestId) || createId("req");
  const userId = (seed && seed.userId) || null;
  const sessionId = (seed && seed.sessionId) || null;
  const start = Date.now();

  function push(phase, data) {
    events.push({
      phase,
      at: nowIso(),
      data: safeClone(data || {})
    });
  }

  function event(phase, data) {
    push(phase, data);
  }

  function tool(name, info) {
    counters.tools += 1;
    push("tool." + (info && info.outcome || "called"), {
      name,
      durationMs: info && info.durationMs || 0,
      ok: Boolean(info && info.ok),
      errorCode: (info && info.errorCode) || null
    });
  }

  function model(name, info) {
    counters.models += 1;
    push("model.call", {
      name,
      durationMs: info && info.durationMs || 0,
      tokens: info && info.tokens || null,
      ok: Boolean(info && info.ok)
    });
  }

  function warning(message, info) {
    push("warning", { message, info: safeClone(info || {}) });
  }

  function error(message, info) {
    counters.errors += 1;
    push("error", { message, info: safeClone(info || {}) });
  }

  function finish(extra) {
    const totalMs = Date.now() - start;
    push("request.finish", Object.assign({
      totalMs,
      counters
    }, extra || {}));
  }

  function render() {
    return {
      requestId,
      userId,
      sessionId,
      totalMs: Date.now() - start,
      counters,
      events
    };
  }

  function toJsonLines() {
    return events.map(ev => JSON.stringify({
      requestId,
      userId,
      sessionId,
      phase: ev.phase,
      at: ev.at,
      data: ev.data
    }));
  }

  return {
    requestId,
    userId,
    sessionId,
    event,
    tool,
    model,
    warning,
    error,
    finish,
    render,
    toJsonLines,
    redact
  };
}

module.exports = {
  createTrace,
  redact
};