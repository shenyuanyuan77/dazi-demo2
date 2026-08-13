const assert = require("assert");
const fs = require("fs");
const path = require("path");

const storage = {};
global.wx = {
  getStorageSync(key) {
    return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : "";
  },
  setStorageSync(key, value) {
    storage[key] = value;
  },
  removeStorageSync(key) {
    delete storage[key];
  }
};

const bodyMetrics = require("../projects/dazi/biz/body_metrics_service.js");
const recognition = require("../projects/dazi/biz/food_recognition_service.js");
const fallback = require("../projects/dazi/biz/ai_response_fallback.js");
const writeService = require("../projects/dazi/biz/ai_write_service.js");
const userStorage = require("../projects/dazi/biz/user_storage.js");
const serverFallback = require(
  "../../cloudfunctions/mcloud/project/dazi/service/ai_response_fallback.js"
);

const parsed = bodyMetrics.parseBodyMetricsText(
  "体重 82kg，体脂率 22.2%，肌肉量 58kg，基础代谢 1750kcal，内脏脂肪 9，腰围 86cm"
);
assert.deepStrictEqual(parsed, {
  weight: 82,
  bodyFatRate: 22.2,
  muscleMass: 58,
  deviceBmr: 1750,
  visceralFatLevel: 9,
  waist: 86
});
const savedBody = bodyMetrics.saveConfirmedMetrics(parsed, { source: "text_import" });
assert.strictEqual(savedBody.success, true);
assert.strictEqual(savedBody.verified, true);
assert.strictEqual(userStorage.get("fitness_profile", {}).currentWeight, "82");
assert.strictEqual(bodyMetrics.getLatestRecord().metrics.waist, 86);

const sourceMessageId = "burger-message";
const active = recognition.beginRecognition(sourceMessageId, ["burger-image"]);
const burgerAnswer = fallback.ensureAssistant({
  type: "diet",
  content: "照片中是一份汉堡王多层皇堡和一杯中杯可乐，总计约1350大卡。",
  payload: {
    proposals: [{
      id: "stale-rice",
      type: "dietLog",
      payload: {
        items: [{
          name: "白米饭",
          amount: 1100,
          unit: "g",
          carbs: 284.9,
          protein: 28.6,
          fat: 3.3,
          confidence: 0.9
        }]
      }
    }]
  }
}, "午餐，帮我记录", { userProfile: { goal: "muscle_gain" } }, true, {
  sourceMessageId,
  recognition: active
});
const burgerProposal = burgerAnswer.payload.proposals[0];
const burgerNames = burgerProposal.payload.items.map(item => item.name);
assert.deepStrictEqual(burgerNames, ["多层皇堡", "中杯可乐"]);
assert.ok(!burgerAnswer.content.includes("白米饭"));
assert.ok(burgerAnswer.content.includes(String(burgerAnswer.payload.calories)));
assert.strictEqual(burgerProposal.payload.recognition.sourceMessageId, sourceMessageId);

const serverBurger = serverFallback.ensureStructuredAnswer({
  type: "diet",
  content: "照片中是汉堡王多层皇堡和中杯可乐。",
  payload: {
    proposals: [{
      id: "server-stale-rice",
      type: "dietLog",
      payload: {
        items: [{ name: "白米饭", amount: 1100, carbs: 284.9, protein: 28.6, fat: 3.3 }]
      }
    }]
  }
}, {
  message: "午餐，帮我记录",
  images: ["image-cloud-id"],
  clientMessageId: "server-burger-message",
  recognitionId: "server-burger-recognition"
});
assert.deepStrictEqual(
  serverBurger.payload.proposals[0].payload.items.map(item => item.name),
  ["多层皇堡", "中杯可乐"]
);
assert.strictEqual(
  serverBurger.payload.proposals[0].payload.recognition.sourceMessageId,
  "server-burger-message"
);

const draft = writeService.createDraftFromProposal(burgerProposal, sourceMessageId);
const confirmed = writeService.confirmAIWriteDraft(draft.id, "lunch", {
  date: "2026-06-14",
  mealType: "lunch",
  foods: draft.payload.foods
});
assert.strictEqual(confirmed.status, "confirmed");
const written = writeService.executeAIWriteDraft(draft.id);
assert.strictEqual(written.status, "success");
assert.deepStrictEqual(
  userStorage.get("fitness_diet_records", {})["2026-06-14"].lunch.map(item => item.name),
  burgerNames
);

const riceRecognition = recognition.beginRecognition("rice-message", ["rice-image"]);
const riceAnswer = fallback.ensureAssistant(
  { type: "diet", content: "图片中有白米饭和鸡胸肉。", payload: {} },
  "记录午餐",
  {},
  true,
  { sourceMessageId: "rice-message", recognition: riceRecognition }
);
assert.deepStrictEqual(
  riceAnswer.payload.proposals[0].payload.items.map(item => item.name),
  ["白米饭", "鸡胸肉"]
);
const secondBurger = recognition.beginRecognition("burger-message-2", ["burger-image-2"]);
const secondAnswer = fallback.ensureAssistant(
  { type: "diet", content: "图片中是汉堡。", payload: {} },
  "记录晚餐",
  {},
  true,
  { sourceMessageId: "burger-message-2", recognition: secondBurger }
);
assert.deepStrictEqual(
  secondAnswer.payload.proposals[0].payload.items.map(item => item.name),
  ["汉堡"]
);
assert.notStrictEqual(riceRecognition.id, secondBurger.id);

const uncertain = fallback.ensureAssistant(
  {
    type: "diet",
    content: "图片较模糊，只能估算宏量营养。",
    payload: { carbs: 30, protein: 20, fat: 10 }
  },
  "识别这张图",
  {},
  true,
  {
    sourceMessageId: "uncertain-message",
    recognition: recognition.beginRecognition("uncertain-message", ["blur-image"])
  }
);
assert.ok(uncertain.content.includes("识别可能不准确"));
assert.strictEqual(uncertain.payload.proposals[0].payload.items[0].confidence, 0.35);
assert.notStrictEqual(uncertain.payload.proposals[0].payload.items[0].name, "白米饭");

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

const homeWxml = read("projects/dazi/pages/home/index/home_index.wxml");
assert.ok(homeWxml.indexOf("AI 今日建议") < homeWxml.indexOf("三大营养素"));

const dietWxml = read("projects/dazi/pages/diet/index/diet_index.wxml");
const dietWxss = read("projects/dazi/pages/diet/index/diet_index.wxss");
assert.ok(dietWxml.includes("onFoodSwipeEnd"));
assert.ok(dietWxss.includes(".swipe-row.open .swipe-delete"));
assert.ok(dietWxss.includes("pointer-events: none"));

const trainingWxml = read("projects/dazi/pages/training/index/training_index.wxml");
const trainingJs = read("projects/dazi/pages/training/index/training_index.js");
assert.ok(trainingWxml.includes("删除本组"));
assert.ok(trainingWxml.includes("删除动作"));
assert.ok(!trainingWxml.includes('class="delete-set'));
assert.ok(trainingJs.includes("仅删除该组，保留空动作"));
assert.ok(trainingJs.includes("该动作下的所有组记录都会被删除"));

console.log("Body metrics, food recognition, and swipe-delete integration tests passed");
