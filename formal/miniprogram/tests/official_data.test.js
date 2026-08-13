// tests/official_data.test.js
// 验证官方膳食指南 / 食物成分 / 身体活动指南常量库到位
// 数据源：
//   - 中国营养学会《中国居民膳食指南（2022）》
//   - 国家卫健委《中国成人身体活动指南（2021）》
//   - 杨月欣《中国食物成分表（标准版）》第 6 版
const assert = require("assert");
const officialData = require("../../cloudfunctions/mcloud/project/dazi/data/index.js");

// 1. 全部官方源到位 + RAG 知识库
const manifest = officialData.manifest();
assert.ok(manifest.length >= 3);
manifest.forEach(item => {
  assert.ok(item.version, `${item.key} 必须有 version`);
  assert.ok(item.source, `${item.key} 必须有 source`);
});

// 2. 膳食指南：关键推荐量与官方一致
const diet = officialData.dietGuidelines;
assert.strictEqual(diet.VEGETABLES_DAILY.min, 300);
assert.strictEqual(diet.VEGETABLES_DAILY.max, 500);
assert.strictEqual(diet.MILK_DAILY.min, 300);
assert.strictEqual(diet.SALT_DAILY_MAX.max, 5);
assert.strictEqual(diet.WATER_DAILY.min, 1500);
assert.strictEqual(diet.ADDED_SUGAR_DAILY_MAX.max, 50);
assert.strictEqual(diet.MEAL_ENERGY_RATIO.breakfast + diet.MEAL_ENERGY_RATIO.lunch + diet.MEAL_ENERGY_RATIO.dinner, 1);

// 3. 能量估算：30 岁男性中度活动应为 2400 kcal
assert.strictEqual(diet.estimateEnergy("male", 30, "moderate"), 2400);
assert.strictEqual(diet.estimateEnergy("female", 30, "moderate"), 2000);

// 4. 活动指南：每周有氧 150-300 min、抗阻 ≥2 次、步数 6000-10000
const activity = officialData.activityGuidelines;
assert.strictEqual(activity.AEROBIC_MIN_WEEK.min, 150);
assert.strictEqual(activity.AEROBIC_MIN_WEEK.max, 300);
assert.strictEqual(activity.RESISTANCE_SESSIONS_WEEK.min, 2);
assert.strictEqual(activity.STEPS_DAILY.min, 6000);
assert.strictEqual(activity.STEPS_DAILY.max, 10000);
assert.strictEqual(activity.rateAerobicWeeklyMinutes(80), "below");
assert.strictEqual(activity.rateAerobicWeeklyMinutes(180), "meets");
assert.strictEqual(activity.rateAerobicWeeklyMinutes(400), "exceeds");
const audit = activity.audit({ weeklyMinutes: 80, resistanceSessions: 0 });
assert.strictEqual(audit.status, "below");
assert.ok(audit.suggestions.length >= 1);

// 5. 食物成分：常用条目数 ≥ 50（按 SPEC），提供 portion 计算
const food = officialData.foodComposition;
assert.ok(food.items.length >= 50, `food items >= 50, 当前 ${food.items.length}`);
const chicken = food.search("鸡胸")[0];
assert.ok(chicken, "应能命中鸡胸");
assert.strictEqual(chicken.kcal, 167);
const portion = food.portion(chicken, 150);
assert.strictEqual(portion.kcal, Math.round(167 * 1.5));
assert.strictEqual(portion.protein, Number((19.4 * 1.5).toFixed(2)));

// 6. 拼装出的 prompt 包含三份常量来源标注
const ctx = officialData.buildOfficialConstraintsPrompt();
assert.ok(ctx.includes("中国居民膳食指南"));
assert.ok(ctx.includes("中国食物成分表"));
assert.ok(ctx.includes("中国成人身体活动指南"));
assert.ok(ctx.includes("【以下为必须遵守的官方约束"), "prompt 必须以官方约束声明开头");

console.log("official_data tests passed");