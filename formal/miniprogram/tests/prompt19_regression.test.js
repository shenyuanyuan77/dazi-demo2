const assert = require("assert");
const fs = require("fs");
const path = require("path");

const bodyMetrics = require("../projects/dazi/biz/body_metrics_service.js");
const energy = require("../projects/dazi/biz/energy_target_service.js");
const intents = require("../projects/dazi/biz/ai_intent_service.js");
const responses = require("./fixtures/ai_response_mode_service.js");

const fixturePath = path.join(__dirname, "fixtures", "body_scale_sample.png");
const expectedPath = path.join(__dirname, "fixtures", "body_scale_sample.expected.json");
assert.ok(fs.existsSync(fixturePath), "body-scale screenshot fixture must exist");
const png = fs.readFileSync(fixturePath);
assert.strictEqual(png.toString("ascii", 1, 4), "PNG");
assert.ok(png.readUInt32BE(20) > 1000, "fixture must retain the long screenshot");

const expected = JSON.parse(fs.readFileSync(expectedPath, "utf8"));
const normalized = bodyMetrics.normalizeMetrics(Object.assign({}, expected, {
  bmr: expected.deviceBmr
}));
["weight", "bmi", "bodyFatRate", "muscleMass", "deviceBmr", "visceralFatLevel"]
  .forEach(key => assert.strictEqual(normalized[key], expected[key]));
assert.strictEqual(normalized.weightControl, -10.8);

const calorie = energy.evaluateEnergyTarget({
  currentWeight: 80,
  targetWeight: 75,
  height: 180,
  bodyFat: 22.2,
  goal: "body_shaping",
  deviceBmr: 1751
}, { weeklyTrainingFrequency: 2 });
assert.strictEqual(calorie.deviceBmr, 1751);
assert.notStrictEqual(calorie.calorieTarget, 1751);
assert.ok(calorie.tdee > calorie.deviceBmr);
assert.ok(calorie.calorieTarget < calorie.tdee);
assert.strictEqual(calorie.weightGap, -5);

const bodyIntent = intents.routeIntent("我180，80kg胖吗");
assert.strictEqual(bodyIntent.intent, "body_status_evaluation");
assert.deepStrictEqual(bodyIntent.entities, { height: 180, weight: 80 });
const bodyAnswer = responses.buildDeterministicResponse(bodyIntent, {
  userProfile: { goal: "body_shaping", raw: {} },
  nutritionSummary: {},
  workoutSummary: {}
});
assert.ok(bodyAnswer.content.includes("24.7"));
assert.ok(!bodyAnswer.content.includes("热量差、安排训练"));
assert.deepStrictEqual(bodyAnswer.payload.proposals, []);

const foodIntent = intents.routeIntent("分析饮食");
assert.strictEqual(foodIntent.intent, "food_analysis_only");
const foodAnswer = responses.buildDeterministicResponse(foodIntent, {
  userProfile: { goal: "body_shaping" },
  nutritionSummary: { totalCalories: 0 },
  workoutSummary: {}
});
assert.ok(foodAnswer.content.includes("饮食记录"));
assert.ok(!foodAnswer.content.includes("安排训练"));

console.log("Prompt 19 regression tests passed");
