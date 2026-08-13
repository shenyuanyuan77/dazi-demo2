const { isWriteTool } = require("../runtime/tools/tool_schemas.js");

function deepGet(value, path) {
  return String(path).split(".").reduce((current, key) => (
    current && current[key] !== undefined ? current[key] : undefined
  ), value);
}

function containsAll(reply, fragments) {
  const text = String(reply || "");
  return (fragments || []).every(fragment => text.includes(String(fragment)));
}

function containsNone(reply, fragments) {
  const text = String(reply || "");
  return (fragments || []).every(fragment => !text.includes(String(fragment)));
}

function stableJson(value) {
  return JSON.stringify(value, Object.keys(JSON.parse(JSON.stringify(value || {}))).sort());
}

function dbChanged(beforeDb, afterDb) {
  return JSON.stringify(beforeDb) !== JSON.stringify(afterDb);
}

function assertTurn(result, expect, beforeDb, afterDb) {
  const failures = [];
  expect = expect || {};
  const toolNames = (result.toolCalls || []).map(call => call.name);

  if (expect.intent && result.intent !== expect.intent) {
    failures.push(`intent expected ${expect.intent}, got ${result.intent}`);
  }

  (expect.mustCallTools || []).forEach(name => {
    if (!toolNames.includes(name)) failures.push(`expected tool ${name} to be called`);
  });

  (expect.mustNotCallTools || []).forEach(name => {
    if (toolNames.includes(name)) failures.push(`tool ${name} must not be called`);
  });

  const hasWriteTool = (result.toolCalls || []).some(call => isWriteTool(call.name));
  if (expect.mustWriteDb && !hasWriteTool) failures.push("expected a confirmed write tool call");
  if (expect.mustNotWriteDb && hasWriteTool) failures.push("write tool was called before confirmation");

  const changed = dbChanged(beforeDb, afterDb);
  if (expect.dbShouldChange === true && !changed) failures.push("expected sandbox DB to change");
  if (expect.dbShouldChange === false && changed) failures.push("expected sandbox DB not to change");

  if (expect.pendingWrite) {
    const pending = result.pendingWrite;
    if (!pending) {
      failures.push("expected pendingWrite");
    } else {
      if (expect.pendingWrite.type && pending.type !== expect.pendingWrite.type) {
        failures.push(`pendingWrite.type expected ${expect.pendingWrite.type}, got ${pending.type}`);
      }
      if (expect.pendingWrite.target && pending.target !== expect.pendingWrite.target) {
        failures.push(`pendingWrite.target expected ${expect.pendingWrite.target}, got ${pending.target}`);
      }
      if (expect.pendingWrite.needUserConfirm && pending.status !== "waiting_confirm") {
        failures.push(`pendingWrite.status expected waiting_confirm, got ${pending.status}`);
      }
    }
  }

  if (expect.replyShouldContain && !containsAll(result.reply, expect.replyShouldContain)) {
    failures.push(`reply did not contain all fragments: ${expect.replyShouldContain.join(", ")}`);
  }
  if (expect.replyShouldNotContain && !containsNone(result.reply, expect.replyShouldNotContain)) {
    failures.push(`reply contained forbidden fragment: ${expect.replyShouldNotContain.join(", ")}`);
  }

  Object.keys(expect.slotsShouldContain || {}).forEach(key => {
    const actual = deepGet(result.slots || {}, key);
    const expected = expect.slotsShouldContain[key];
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      failures.push(`slot ${key} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  });

  if (result.validationResult && !result.validationResult.passed) {
    failures.push(`runtime validation failed: ${result.validationResult.errors.join("; ")}`);
  }

  return failures;
}

module.exports = {
  assertTurn,
  dbChanged,
  stableJson
};
