function buildReport(results) {
  const total = results.length;
  const passed = results.filter(item => item.passed).length;
  const failed = total - passed;
  return {
    total,
    passed,
    failed,
    failures: results
      .filter(item => !item.passed)
      .map(item => ({
        id: item.id,
        name: item.name,
        turnIndex: item.turnIndex,
        reasons: item.failures,
        actualIntent: item.actual && item.actual.intent,
        actualToolCalls: item.actual && item.actual.toolCalls,
        actualPendingWrite: item.actual && item.actual.pendingWrite,
        dbDiff: item.dbDiff,
        finalReply: item.actual && item.actual.reply
      }))
  };
}

function printReport(report) {
  console.log(`Agent Harness Eval: ${report.passed}/${report.total} passed, ${report.failed} failed`);
  if (!report.failures.length) return;
  report.failures.forEach(item => {
    console.log(`\n[FAIL] ${item.id} ${item.name} turn ${item.turnIndex + 1}`);
    item.reasons.forEach(reason => console.log(`- ${reason}`));
    console.log(`intent=${item.actualIntent}`);
    console.log(`toolCalls=${JSON.stringify(item.actualToolCalls)}`);
    console.log(`pendingWrite=${JSON.stringify(item.actualPendingWrite)}`);
    console.log(`dbDiff=${JSON.stringify(item.dbDiff)}`);
    console.log(`reply=${item.finalReply}`);
  });
}

module.exports = {
  buildReport,
  printReport
};
