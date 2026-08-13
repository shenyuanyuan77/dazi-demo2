const fs = require("fs");
const path = require("path");
const AgentOrchestrator = require("../runtime/orchestrator/agent_orchestrator.js");
const { assertQaPair } = require("./qa_assertions.js");
const { buildReport, printReport } = require("./report.js");
const { createSandboxDb, snapshotDb } = require("./sandboxDb.js");

function loadQaPairs() {
  const dir = path.join(__dirname, "qa-pairs");
  return fs.readdirSync(dir)
    .filter(name => name.endsWith(".json"))
    .sort()
    .flatMap(name => {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
      return (Array.isArray(parsed) ? parsed : [parsed]).map(item => Object.assign({ file: name }, item));
    });
}

function diffDb(beforeDb, afterDb) {
  const diff = {};
  ["dietLogs", "trainingLogs", "trainingPlans", "bodyMetrics"].forEach(key => {
    const before = beforeDb[key] || [];
    const after = afterDb[key] || [];
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      diff[key] = { before: before.length, after: after.length };
    }
  });
  return diff;
}

async function runQaPair(pair) {
  const db = createSandboxDb(pair.initialState || {});
  const orchestrator = new AgentOrchestrator({
    now: new Date("2026-07-03T08:00:00.000Z")
  });
  const beforeDb = snapshotDb(db);
  const result = await orchestrator.runTurn({
    userId: "qa-user",
    sessionId: pair.id,
    message: pair.question,
    images: pair.images || [],
    imageData: pair.images || [],
    profile: pair.initialState && pair.initialState.userProfile || {},
    db
  });
  const afterDb = snapshotDb(db);
  const failures = assertQaPair(result, pair, beforeDb, afterDb);
  return {
    id: pair.id,
    name: pair.name || pair.question,
    turnIndex: 0,
    passed: failures.length === 0,
    failures,
    expectedAnswer: pair.expectedAnswer || "",
    actual: {
      intent: result.intent,
      reply: result.reply,
      slots: result.slots,
      toolCalls: result.toolCalls.map(call => ({
        name: call.name,
        ok: Boolean(call.result && call.result.ok)
      })),
      pendingWrite: result.pendingWrite || null,
      trace: (result.trace || []).map(item => item.phase)
    },
    dbDiff: diffDb(beforeDb, afterDb)
  };
}

async function main() {
  const pairs = loadQaPairs();
  const results = [];
  for (const pair of pairs) {
    results.push(await runQaPair(pair));
  }
  const report = buildReport(results);
  report.totalPairs = pairs.length;
  report.expectedAnswerFailures = results
    .filter(item => !item.passed)
    .map(item => ({
      id: item.id,
      expectedAnswer: item.expectedAnswer
    }));
  printReport(report);
  fs.writeFileSync(
    path.join(__dirname, "last-qa-report.json"),
    JSON.stringify(report, null, 2)
  );
  if (report.failed) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = {
  loadQaPairs,
  runQaPair
};
