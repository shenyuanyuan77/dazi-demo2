const { assertTurn } = require("./assertions.js");

function hasPhrase(text, phrase) {
  return String(text || "").includes(String(phrase));
}

function assertQaPair(result, pair, beforeDb, afterDb) {
  const expect = pair.expect || {};
  const failures = assertTurn(result, {
    intent: expect.intent,
    mustCallTools: expect.mustCallTools,
    mustNotCallTools: expect.mustNotCallTools,
    mustWriteDb: expect.mustWriteDb,
    mustNotWriteDb: expect.mustNotWriteDb,
    dbShouldChange: expect.dbShouldChange,
    pendingWrite: expect.pendingWrite,
    replyShouldContain: expect.answerMustContain,
    replyShouldNotContain: expect.answerMustNotContain,
    slotsShouldContain: expect.slotsShouldContain
  }, beforeDb, afterDb);

  if (expect.mustNotCreatePendingWrite && result.pendingWrite) {
    failures.push(`expected no pendingWrite, got ${result.pendingWrite.type}`);
  }

  if (expect.mustAskConfirmation) {
    if (!result.pendingWrite) failures.push("expected confirmation flow with pendingWrite");
    if (!/(确认|核对|保存|写入)/.test(String(result.reply || ""))) {
      failures.push("expected reply to ask for user confirmation");
    }
  }

  if (expect.mustRefuseUnsupported) {
    if (result.intent !== "UNSUPPORTED") failures.push(`expected UNSUPPORTED refusal, got ${result.intent}`);
    if (!hasPhrase(result.reply, "只支持")) failures.push("unsupported reply must state supported scope");
    if (result.pendingWrite) failures.push("unsupported reply must not create pendingWrite");
  }

  (expect.traceMustInclude || []).forEach(phase => {
    if (!(result.trace || []).some(item => item.phase === phase)) {
      failures.push(`trace missing phase ${phase}`);
    }
  });

  if (expect.maxReplyChars && String(result.reply || "").length > expect.maxReplyChars) {
    failures.push(`reply too long: ${String(result.reply || "").length} > ${expect.maxReplyChars}`);
  }

  if (expect.forbidUnsupportedExpansion) {
    const forbidden = [
      "第一步",
      "第二步",
      "论文",
      "代码如下",
      "旅游路线",
      "买入",
      "卖出",
      "景点",
      "合同条款",
      "开奖号码"
    ];
    forbidden.forEach(fragment => {
      if (hasPhrase(result.reply, fragment)) failures.push(`unsupported answer expanded with ${fragment}`);
    });
  }

  return failures;
}

module.exports = { assertQaPair };
