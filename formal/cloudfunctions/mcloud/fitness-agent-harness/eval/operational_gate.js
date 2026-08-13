const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const harnessRoot = path.resolve(__dirname, "..");
const mcloudRoot = path.resolve(harnessRoot, "..");

const MIN_STRUCTURED_TURNS = 25;
const MIN_QA_PAIRS = 75;
const MIN_UNSUPPORTED_QA = 20;
const REQUIRED_QA_CATEGORIES = [
  "confirmation",
  "diet_record",
  "diet_record_image",
  "diet_read_only",
  "diet_read_only_image",
  "diet_suggestion",
  "training_record",
  "training_plan_create",
  "training_plan_update",
  "body_analysis",
  "body_image",
  "body_query",
  "body_read_only",
  "body_read_only_image",
  "unsupported"
];
const ALLOWED_QA_CATEGORIES = new Set(REQUIRED_QA_CATEGORIES);

function runNode(args, label) {
  const result = spawnSync(process.execPath, args, {
    cwd: mcloudRoot,
    encoding: "utf8"
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(harnessRoot, relativePath), "utf8"));
}

function walkJsFiles(root) {
  const files = [];
  fs.readdirSync(root, { withFileTypes: true }).forEach(entry => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walkJsFiles(fullPath).forEach(file => files.push(file));
      return;
    }
    if (entry.isFile() && entry.name.endsWith(".js")) files.push(fullPath);
  });
  return files;
}

function loadQaPairs() {
  const dir = path.join(harnessRoot, "eval", "qa-pairs");
  return fs.readdirSync(dir)
    .filter(name => name.endsWith(".json"))
    .flatMap(name => {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
      return Array.isArray(parsed) ? parsed : [parsed];
    });
}

function assertReport(report, minTotal, label) {
  if (!report || typeof report !== "object") throw new Error(`${label} report missing`);
  if (report.total < minTotal) {
    throw new Error(`${label} total ${report.total} below required ${minTotal}`);
  }
  if (report.failed !== 0 || report.passed !== report.total) {
    throw new Error(`${label} not green: ${report.passed}/${report.total}`);
  }
}

function assertQaCoverage(pairs) {
  if (pairs.length < MIN_QA_PAIRS) {
    throw new Error(`QA pair count ${pairs.length} below required ${MIN_QA_PAIRS}`);
  }
  const seenIds = new Set();
  const duplicateIds = [];
  pairs.forEach(item => {
    if (!item.id) throw new Error(`QA pair missing id for question: ${item.question || ""}`);
    if (seenIds.has(item.id)) duplicateIds.push(item.id);
    seenIds.add(item.id);
    if (!item.question) throw new Error(`QA pair ${item.id} missing question`);
    if (!item.expect || typeof item.expect !== "object") throw new Error(`QA pair ${item.id} missing expect`);
    if (!ALLOWED_QA_CATEGORIES.has(item.category)) {
      throw new Error(`QA pair ${item.id} has unknown category: ${item.category}`);
    }
  });
  if (duplicateIds.length) {
    throw new Error(`duplicate QA pair ids: ${duplicateIds.join(", ")}`);
  }
  const missingExpected = pairs.filter(item => !String(item.expectedAnswer || "").trim());
  if (missingExpected.length) {
    throw new Error(`QA pairs missing expectedAnswer: ${missingExpected.map(item => item.id).join(", ")}`);
  }
  const categories = new Set(pairs.map(item => item.category).filter(Boolean));
  const missingCategories = REQUIRED_QA_CATEGORIES.filter(category => !categories.has(category));
  if (missingCategories.length) {
    throw new Error(`QA coverage missing categories: ${missingCategories.join(", ")}`);
  }
  const unsupportedCount = pairs.filter(item => item.category === "unsupported").length;
  if (unsupportedCount < MIN_UNSUPPORTED_QA) {
    throw new Error(`unsupported QA count ${unsupportedCount} below required ${MIN_UNSUPPORTED_QA}`);
  }
}

function qaCategoryCounts(pairs) {
  return pairs.reduce((counts, item) => {
    counts[item.category] = (counts[item.category] || 0) + 1;
    return counts;
  }, {});
}

function runSyntaxChecks() {
  const files = walkJsFiles(harnessRoot).concat(
    path.join(mcloudRoot, "project", "dazi", "service", "ai_service.js")
  );
  files.forEach(file => runNode(["--check", file], `syntax check ${path.relative(mcloudRoot, file)}`));
}

function main() {
  runNode([path.join(harnessRoot, "eval", "runner.js")], "structured harness eval");
  runNode([path.join(harnessRoot, "eval", "qa_runner.js")], "QA pairs eval");
  runNode([path.join(harnessRoot, "eval", "adapter_contract.test.js")], "adapter answer contract tests");
  runSyntaxChecks();

  const structuredReport = readJson(path.join("eval", "last-report.json"));
  const qaReport = readJson(path.join("eval", "last-qa-report.json"));
  assertReport(structuredReport, MIN_STRUCTURED_TURNS, "structured harness eval");
  assertReport(qaReport, MIN_QA_PAIRS, "QA pairs eval");
  const qaPairs = loadQaPairs();
  assertQaCoverage(qaPairs);

  const summary = {
    ok: true,
    structuredTurns: structuredReport.total,
    qaPairs: qaReport.total,
    adapterContractTests: "passed",
    unsupportedQaPairs: qaPairs.filter(item => item.category === "unsupported").length,
    qaCategoryCounts: qaCategoryCounts(qaPairs),
    checkedAt: new Date().toISOString()
  };
  fs.writeFileSync(
    path.join(harnessRoot, "eval", "last-operational-gate.json"),
    JSON.stringify(summary, null, 2)
  );
  console.log(`Operational gate passed: ${summary.structuredTurns} structured turns, ${summary.qaPairs} QA pairs.`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err && err.stack || err);
    process.exitCode = 1;
  }
}

module.exports = {
  main
};
