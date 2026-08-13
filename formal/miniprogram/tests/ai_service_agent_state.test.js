const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(
  path.join(__dirname, "../../cloudfunctions/mcloud/project/dazi/service/ai_service.js"),
  "utf8"
);

assert.ok(source.includes("_buildAgentState({"));
assert.ok(source.includes("_pendingConfirmationMessage(proposal = {})"));
assert.ok(source.includes("_deriveToolName(intent = {}, hasImages = false)"));
assert.ok(source.includes("agentState,"));
assert.ok(source.includes("pendingConfirmation"));
assert.ok(source.includes("pendingWrite"));
assert.ok(source.includes("lastToolCall"));
assert.ok(source.includes("food_image_analyze"));
assert.ok(source.includes("calculate_remaining_calories"));

console.log("AI service agent state contract tests passed");
