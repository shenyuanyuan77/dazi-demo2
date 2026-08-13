const assert = require("assert");
const fs = require("fs");
const path = require("path");

const chatJs = fs.readFileSync(
  path.join(__dirname, "../projects/dazi/pages/ai/chat/ai_chat.js"),
  "utf8"
);
const chatWxml = fs.readFileSync(
  path.join(__dirname, "../projects/dazi/pages/ai/chat/ai_chat.wxml"),
  "utf8"
);

[
  "加到这一天",
  "替换这一天的训练",
  "安排到明天",
  "保存到本周计划",
  "存成常用模板"
].forEach(label => assert.ok(chatJs.includes(label)));

assert.ok(chatJs.includes("aiResponseFallback.ensureAssistant"));
assert.ok(chatJs.includes("aiWriteService.executeAIWriteDraft"));
assert.ok(chatJs.includes("aiWriteService.cancelAIWriteDraft"));
assert.ok(chatJs.includes("_ensureVisibleProposalCard"));
assert.ok(chatJs.includes("_buildImplicitImagePrompt"));
assert.ok(chatJs.includes("proposalBuilder.getPendingProposal"));
assert.ok(chatJs.includes("_applyLocalProposalPatch"));
assert.ok(chatJs.includes("validators.filterProposalList"));
assert.ok(chatWxml.includes("拍照记饮食"));
assert.ok(chatWxml.includes("记录身体变化"));
assert.ok(chatWxml.includes("保存这条"));
assert.ok(chatWxml.includes("先不保存"));
assert.ok(chatWxml.includes("已保存，并完成核对"));
assert.ok(chatWxml.includes("proposal.payload.exercises"));
assert.ok(chatWxml.includes("proposal.payload.items"));
assert.ok(chatWxml.includes("message-stack"));

assert.ok(chatJs.includes("_buildManualProposalFallback"));
assert.ok(chatWxml.includes("proposal.payload.profilePatch"));

console.log("AI agent UI contract tests passed");
