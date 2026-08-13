const intentRouter = require("./intent_router.js");

module.exports = {
  QUICK_ACTION_INTENT_MAP: intentRouter.QUICK_ACTION_INTENT_MAP,
  RESPONSE_MODES: intentRouter.RESPONSE_MODES,
  hasExplicitWriteIntent: intentRouter.hasExplicitWriteIntent,
  parseBodyStatusQuestion: intentRouter.parseBodyStatusQuestion,
  routeIntent: intentRouter.routeIntent,
  shouldUsePreviousRecognition: intentRouter.shouldUsePreviousRecognition
};
