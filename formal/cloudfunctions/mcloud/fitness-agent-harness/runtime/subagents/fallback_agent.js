const { unsupportedReply } = require("../guardrails/guardrails.js");

function buildUnsupportedResult() {
  return {
    reply: unsupportedReply(),
    slots: {}
  };
}

module.exports = { buildUnsupportedResult };
