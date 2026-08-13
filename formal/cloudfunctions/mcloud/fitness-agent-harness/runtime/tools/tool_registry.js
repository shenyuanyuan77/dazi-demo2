const { getToolSchema, TOOL_SCHEMAS } = require("./tool_schemas.js");
const { createId } = require("../../shared/utils/id.js");
const { cloneJson } = require("../../shared/utils/object.js");

function ok(data) {
  return { ok: true, data: data || {} };
}

function fail(code, message) {
  return { ok: false, error: { code, message } };
}

function ensureDb(context) {
  const db = context.db || {};
  db.userProfiles = db.userProfiles || {};
  db.dietLogs = db.dietLogs || [];
  db.trainingLogs = db.trainingLogs || [];
  db.trainingPlans = db.trainingPlans || [];
  db.bodyMetrics = db.bodyMetrics || [];
  context.db = db;
  return db;
}

function sumNutrition(items) {
  return (items || []).reduce((sum, item) => ({
    calories: sum.calories + Math.max(0, Number(item.calories) || 0),
    protein: sum.protein + Math.max(0, Number(item.protein) || 0),
    carbs: sum.carbs + Math.max(0, Number(item.carbs) || 0),
    fat: sum.fat + Math.max(0, Number(item.fat) || 0)
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

const DEFAULT_HANDLERS = {
  "user.profile.get": async (input, context) => {
    const db = ensureDb(context);
    return ok({ profile: db.userProfiles[input.userId] || context.profile || {} });
  },
  "user.profile.update": async (input, context) => {
    const db = ensureDb(context);
    db.userProfiles[input.userId] = Object.assign(
      {},
      db.userProfiles[input.userId] || context.profile || {},
      input.profilePatch || {}
    );
    return ok({ profile: db.userProfiles[input.userId] });
  },
  "diet.log.create": async (input, context) => {
    const db = ensureDb(context);
    const record = Object.assign({}, input, { id: createId("diet-log") });
    db.dietLogs.push(record);
    return ok({ logId: record.id, record });
  },
  "diet.log.query": async (input, context) => {
    const db = ensureDb(context);
    const list = db.dietLogs
      .filter(item => !input.date || item.date === input.date)
      .slice(-(Number(input.limit) || 20));
    return ok({ list });
  },
  "diet.analyze": async (input) => {
    const items = [];
    (input.dietLogs || []).forEach(log => items.push.apply(items, log.items || []));
    const nutrition = sumNutrition(items);
    const target = Number(input.profile && input.profile.dailyCalorieTarget) || 1800;
    const remaining = Math.max(0, target - nutrition.calories);
    return ok({
      caloriesConsumed: Math.round(nutrition.calories),
      protein: Math.round(nutrition.protein * 10) / 10,
      remainingCalories: remaining,
      advice: [
        remaining > 600 ? "晚餐还有较充足空间，优先选择高蛋白和蔬菜。" : "剩余热量不多，建议控制主食和油脂。",
        nutrition.protein < 60 ? "蛋白质偏低，可以补充鸡蛋、鱼虾、鸡胸或豆制品。" : "蛋白质摄入基本够用，注意饮食均衡。"
      ]
    });
  },
  "training.plan.create": async (input, context) => {
    const db = ensureDb(context);
    const plan = Object.assign({}, input.plan || input, { id: createId("training-plan") });
    db.trainingPlans.push(plan);
    return ok({ planId: plan.id, plan });
  },
  "training.plan.get": async (input, context) => {
    const db = ensureDb(context);
    const list = db.trainingPlans
      .filter(item => !input.date || item.date === input.date || item.startDate === input.date)
      .slice(-(Number(input.limit) || 10));
    return ok({ list });
  },
  "training.plan.update": async (input, context) => {
    const db = ensureDb(context);
    const plan = Object.assign({ id: createId("training-plan") }, input.patch || {}, {
      userId: input.userId,
      date: input.date,
      operation: input.operation || "update"
    });
    db.trainingPlans.push(plan);
    return ok({ planId: plan.id, plan });
  },
  "training.log.create": async (input, context) => {
    const db = ensureDb(context);
    const record = Object.assign({}, input, { id: createId("training-log") });
    db.trainingLogs.push(record);
    return ok({ logId: record.id, record });
  },
  "training.log.query": async (input, context) => {
    const db = ensureDb(context);
    const list = db.trainingLogs
      .filter(item => !input.date || item.date === input.date)
      .slice(-(Number(input.limit) || 20));
    return ok({ list });
  },
  "body.metric.create": async (input, context) => {
    const db = ensureDb(context);
    const record = Object.assign({}, input, { id: createId("body-metric") });
    db.bodyMetrics.push(record);
    return ok({ metricId: record.id, record });
  },
  "body.metric.query": async (input, context) => {
    const db = ensureDb(context);
    return ok({ list: db.bodyMetrics.slice(-(Number(input.limit) || 20)) });
  },
  "body.analyze": async (input) => {
    const metrics = input.metrics || [];
    const latest = metrics[metrics.length - 1] || input.profile || {};
    return ok({
      latest,
      trend: { count: metrics.length },
      advice: [
        "优先观察 7 日趋势，不要被单日波动影响。",
        "减脂期建议维持力量训练，并保证蛋白质和睡眠。"
      ]
    });
  },
  "vision.food.recognize": async () => ok({
    items: [{
      name: "图片餐食（待核对）",
      amount: 1,
      unit: "份",
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      confidence: 0.3
    }],
    confidence: 0.3,
    needsReview: true
  }),
  "vision.bodyScale.ocr": async () => ok({
    metrics: {},
    confidence: 0.3,
    needsReview: true
  }),
  "wechat.login": async () => fail("NOT_AVAILABLE_IN_EVAL", "wechat.login 需要小程序运行环境"),
  "wechat.profile.sync": async () => fail("NOT_AVAILABLE_IN_EVAL", "wechat.profile.sync 需要用户授权")
};

class ToolRegistry {
  constructor(handlers) {
    this.handlers = Object.assign({}, DEFAULT_HANDLERS, handlers || {});
  }

  async call(name, input, context) {
    const schema = getToolSchema(name);
    if (!schema) return fail("TOOL_NOT_FOUND", `未知工具：${name}`);
    const handler = this.handlers[name];
    if (!handler) return fail("TOOL_NOT_IMPLEMENTED", `工具未实现：${name}`);
    try {
      const result = await handler(cloneJson(input || {}, {}), context || {});
      if (!result || typeof result !== "object") return ok({ value: result });
      if (result.ok === false) return result;
      if (result.ok === true) return result;
      return ok(result);
    } catch (err) {
      return fail("TOOL_EXCEPTION", String(err && err.message || err).slice(0, 240));
    }
  }

  describe(name) {
    return TOOL_SCHEMAS[name] || null;
  }
}

module.exports = {
  DEFAULT_HANDLERS,
  ToolRegistry,
  fail,
  ok
};
