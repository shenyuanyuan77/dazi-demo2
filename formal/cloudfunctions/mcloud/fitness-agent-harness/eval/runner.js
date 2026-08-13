const fs = require("fs");
const path = require("path");
const AgentOrchestrator = require("../runtime/orchestrator/agent_orchestrator.js");
const { assertTurn } = require("./assertions.js");
const { buildReport, printReport } = require("./report.js");
const { createSandboxDb, snapshotDb } = require("./sandboxDb.js");

function loadCases() {
  const casesDir = path.join(__dirname, "cases");
  return fs.readdirSync(casesDir)
    .filter(name => name.endsWith(".json"))
    .sort()
    .flatMap(name => {
      const fullPath = path.join(casesDir, name);
      const parsed = JSON.parse(fs.readFileSync(fullPath, "utf8"));
      const list = Array.isArray(parsed) ? parsed : [parsed];
      return list.map(item => Object.assign({ file: name }, item));
    });
}

function dbDiff(beforeDb, afterDb) {
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

async function runCase(testCase) {
  const db = createSandboxDb(testCase.initialState || {});
  let previousState = null;
  const results = [];
  const orchestrator = new AgentOrchestrator({
    now: new Date("2026-07-03T08:00:00.000Z")
  });
  for (let turnIndex = 0; turnIndex < testCase.turns.length; turnIndex += 1) {
    const turn = testCase.turns[turnIndex];
    const beforeDb = snapshotDb(db);
    const result = await orchestrator.runTurn({
      userId: "eval-user",
      sessionId: testCase.id,
      message: turn.user,
      images: turn.images || [],
      imageData: turn.images || [],
      profile: testCase.initialState && testCase.initialState.userProfile || {},
      previousState,
      db
    });
    const afterDb = snapshotDb(db);
    const failures = assertTurn(result, turn.expect || {}, beforeDb, afterDb);
    previousState = result.state;
    results.push({
      id: testCase.id,
      name: testCase.name,
      turnIndex,
      passed: failures.length === 0,
      failures,
      actual: {
        intent: result.intent,
        reply: result.reply,
        slots: result.slots,
        toolCalls: result.toolCalls.map(call => ({
          name: call.name,
          ok: Boolean(call.result && call.result.ok)
        })),
        pendingWrite: result.pendingWrite || null
      },
      dbDiff: dbDiff(beforeDb, afterDb)
    });
  }
  return results;
}

async function main() {
  const cases = loadCases();
  const allResults = [];
  for (const testCase of cases) {
    const results = await runCase(testCase);
    allResults.push.apply(allResults, results);
  }
  const report = buildReport(allResults);
  printReport(report);
  const outPath = path.join(__dirname, "last-report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  if (report.failed) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = {
  loadCases,
  runCase
};
