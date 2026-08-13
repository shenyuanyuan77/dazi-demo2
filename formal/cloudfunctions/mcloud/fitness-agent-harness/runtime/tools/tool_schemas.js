const { ToolPermissionLevel } = require("../../shared/types/agent_types.js");

/**
 * Tool schema registry — agent 可用工具的元数据单一来源。
 *
 * 字段约定：
 *  - name                工具名称（注册时主键）
 *  - category            业务类别（profile / diet / training / body / vision / wechat / observability）
 *  - permissionLevel     read | write | sensitive_write
 *  - requiresConfirmation 写操作要求 pendingWrite + 用户二次确认
 *  - timeoutMs           工具执行超时（毫秒），仅在异步包装器里使用
 *  - idempotent          是否幂等：true 时即便 orchestrator 重试也安全
 *  - sensitiveFields[]   写结果里需在日志中脱敏的字段（昵称、openid 等）
 *  - i18nLabel           中文/英文标签，便于审计与提示
 *  - sourceRequired      true 表示需在 Answer 中标注官方来源（如 BMI、能量）
 *  - input/output        类型签名（人类可读字符串）
 */
const TOOL_SCHEMAS = Object.freeze({
  "user.profile.get": {
    name: "user.profile.get",
    category: "profile",
    permissionLevel: ToolPermissionLevel.READ,
    requiresConfirmation: false,
    timeoutMs: 1500,
    idempotent: true,
    sensitiveFields: ["nickname", "phone", "email"],
    i18nLabel: { zh: "读取用户画像", en: "Read user profile" },
    sourceRequired: false,
    input: { userId: "string" },
    output: { profile: "UserProfile" }
  },
  "user.profile.update": {
    name: "user.profile.update",
    category: "profile",
    permissionLevel: ToolPermissionLevel.SENSITIVE_WRITE,
    requiresConfirmation: true,
    timeoutMs: 2500,
    idempotent: false,
    sensitiveFields: ["nickname", "phone", "email"],
    i18nLabel: { zh: "更新用户画像", en: "Update user profile" },
    sourceRequired: false,
    input: { userId: "string", profilePatch: "object", source: "chat|card|manual" },
    output: { profile: "UserProfile" }
  },
  "diet.log.create": {
    name: "diet.log.create",
    category: "diet",
    permissionLevel: ToolPermissionLevel.WRITE,
    requiresConfirmation: true,
    timeoutMs: 2000,
    idempotent: false,
    sensitiveFields: [],
    i18nLabel: { zh: "写入饮食记录", en: "Create diet log" },
    sourceRequired: true,
    input: { userId: "string", date: "YYYY-MM-DD", meal: "string", items: "FoodItem[]", source: "chat|card|manual" },
    output: { logId: "string", record: "DietLog" }
  },
  "diet.log.query": {
    name: "diet.log.query",
    category: "diet",
    permissionLevel: ToolPermissionLevel.READ,
    requiresConfirmation: false,
    timeoutMs: 1500,
    idempotent: true,
    sensitiveFields: [],
    i18nLabel: { zh: "查询饮食记录", en: "Query diet logs" },
    sourceRequired: false,
    input: { userId: "string", date: "YYYY-MM-DD?", limit: "number?" },
    output: { list: "DietLog[]" }
  },
  "diet.analyze": {
    name: "diet.analyze",
    category: "diet",
    permissionLevel: ToolPermissionLevel.READ,
    requiresConfirmation: false,
    timeoutMs: 3000,
    idempotent: true,
    sensitiveFields: [],
    i18nLabel: { zh: "分析今日饮食", en: "Analyze diet" },
    sourceRequired: true,
    input: { userId: "string", profile: "UserProfile", dietLogs: "DietLog[]", trainingLogs: "TrainingLog[]" },
    output: { caloriesConsumed: "number", protein: "number", advice: "string[]" }
  },
  "training.plan.create": {
    name: "training.plan.create",
    category: "training",
    permissionLevel: ToolPermissionLevel.WRITE,
    requiresConfirmation: true,
    timeoutMs: 2500,
    idempotent: false,
    sensitiveFields: [],
    i18nLabel: { zh: "创建训练计划", en: "Create training plan" },
    sourceRequired: true,
    input: { userId: "string", date: "YYYY-MM-DD", plan: "TrainingPlan", source: "chat|card|manual" },
    output: { planId: "string", plan: "TrainingPlan" }
  },
  "training.plan.get": {
    name: "training.plan.get",
    category: "training",
    permissionLevel: ToolPermissionLevel.READ,
    requiresConfirmation: false,
    timeoutMs: 1500,
    idempotent: true,
    sensitiveFields: [],
    i18nLabel: { zh: "读取训练计划", en: "Get training plan" },
    sourceRequired: false,
    input: { userId: "string", date: "YYYY-MM-DD?", limit: "number?" },
    output: { list: "TrainingPlan[]" }
  },
  "training.plan.update": {
    name: "training.plan.update",
    category: "training",
    permissionLevel: ToolPermissionLevel.WRITE,
    requiresConfirmation: true,
    timeoutMs: 2500,
    idempotent: false,
    sensitiveFields: [],
    i18nLabel: { zh: "更新训练计划", en: "Update training plan" },
    sourceRequired: true,
    input: { userId: "string", date: "YYYY-MM-DD", patch: "object", source: "chat|card|manual" },
    output: { planId: "string", plan: "TrainingPlan" }
  },
  "training.log.create": {
    name: "training.log.create",
    category: "training",
    permissionLevel: ToolPermissionLevel.WRITE,
    requiresConfirmation: true,
    timeoutMs: 2000,
    idempotent: false,
    sensitiveFields: [],
    i18nLabel: { zh: "写入训练记录", en: "Create training log" },
    sourceRequired: false,
    input: { userId: "string", date: "YYYY-MM-DD", items: "TrainingItem[]", source: "chat|card|manual" },
    output: { logId: "string", record: "TrainingLog" }
  },
  "training.log.query": {
    name: "training.log.query",
    category: "training",
    permissionLevel: ToolPermissionLevel.READ,
    requiresConfirmation: false,
    timeoutMs: 1500,
    idempotent: true,
    sensitiveFields: [],
    i18nLabel: { zh: "查询训练记录", en: "Query training logs" },
    sourceRequired: false,
    input: { userId: "string", date: "YYYY-MM-DD?", limit: "number?" },
    output: { list: "TrainingLog[]" }
  },
  "body.metric.create": {
    name: "body.metric.create",
    category: "body",
    permissionLevel: ToolPermissionLevel.WRITE,
    requiresConfirmation: true,
    timeoutMs: 2000,
    idempotent: false,
    sensitiveFields: [],
    i18nLabel: { zh: "写入身体数据", en: "Create body metric" },
    sourceRequired: true,
    input: { userId: "string", date: "YYYY-MM-DD", metrics: "BodyMetric", source: "chat|card|manual" },
    output: { metricId: "string", record: "BodyMetric" }
  },
  "body.metric.query": {
    name: "body.metric.query",
    category: "body",
    permissionLevel: ToolPermissionLevel.READ,
    requiresConfirmation: false,
    timeoutMs: 1500,
    idempotent: true,
    sensitiveFields: [],
    i18nLabel: { zh: "查询身体数据", en: "Query body metrics" },
    sourceRequired: false,
    input: { userId: "string", limit: "number?" },
    output: { list: "BodyMetric[]" }
  },
  "body.analyze": {
    name: "body.analyze",
    category: "body",
    permissionLevel: ToolPermissionLevel.READ,
    requiresConfirmation: false,
    timeoutMs: 3000,
    idempotent: true,
    sensitiveFields: [],
    i18nLabel: { zh: "分析身体数据", en: "Analyze body metrics" },
    sourceRequired: true,
    input: { userId: "string", profile: "UserProfile", metrics: "BodyMetric[]" },
    output: { trend: "object", advice: "string[]" }
  },
  "vision.food.recognize": {
    name: "vision.food.recognize",
    category: "vision",
    permissionLevel: ToolPermissionLevel.READ,
    requiresConfirmation: false,
    timeoutMs: 8000,
    idempotent: true,
    sensitiveFields: [],
    i18nLabel: { zh: "识别食物图片", en: "Recognize food image" },
    sourceRequired: true,
    input: { userId: "string", images: "image[]" },
    output: { items: "FoodItem[]", confidence: "number" }
  },
  "vision.bodyScale.ocr": {
    name: "vision.bodyScale.ocr",
    category: "vision",
    permissionLevel: ToolPermissionLevel.READ,
    requiresConfirmation: false,
    timeoutMs: 8000,
    idempotent: true,
    sensitiveFields: [],
    i18nLabel: { zh: "识别体脂秤截图", en: "OCR body scale image" },
    sourceRequired: true,
    input: { userId: "string", images: "image[]" },
    output: { metrics: "BodyMetric", confidence: "number" }
  },
  "wechat.login": {
    name: "wechat.login",
    category: "wechat",
    permissionLevel: ToolPermissionLevel.READ,
    requiresConfirmation: false,
    timeoutMs: 4000,
    idempotent: true,
    sensitiveFields: ["openId", "unionId"],
    i18nLabel: { zh: "微信登录", en: "WeChat login" },
    sourceRequired: false,
    input: { code: "string" },
    output: { openId: "string", unionId: "string?" }
  },
  "wechat.profile.sync": {
    name: "wechat.profile.sync",
    category: "wechat",
    permissionLevel: ToolPermissionLevel.SENSITIVE_WRITE,
    requiresConfirmation: true,
    timeoutMs: 4000,
    idempotent: true,
    sensitiveFields: ["nickname", "avatar"],
    i18nLabel: { zh: "同步微信资料", en: "Sync WeChat profile" },
    sourceRequired: false,
    input: { userId: "string", wechatProfile: "object" },
    output: { synced: "boolean" }
  }
});

function getToolSchema(name) {
  return TOOL_SCHEMAS[name] || null;
}

function listToolSchemas() {
  return Object.keys(TOOL_SCHEMAS).map(name => TOOL_SCHEMAS[name]);
}

function isWriteTool(name) {
  const schema = getToolSchema(name);
  return Boolean(schema && (
    schema.permissionLevel === ToolPermissionLevel.WRITE ||
    schema.permissionLevel === ToolPermissionLevel.SENSITIVE_WRITE
  ));
}

function isReadTool(name) {
  const schema = getToolSchema(name);
  return Boolean(schema && schema.permissionLevel === ToolPermissionLevel.READ);
}

function requiresSource(name) {
  const schema = getToolSchema(name);
  return Boolean(schema && schema.sourceRequired);
}

function getCategory(name) {
  const schema = getToolSchema(name);
  return schema ? schema.category : "unknown";
}

function listToolsByCategory(category) {
  return listToolSchemas().filter(schema => schema.category === category);
}

module.exports = {
  TOOL_SCHEMAS,
  getToolSchema,
  isWriteTool,
  isReadTool,
  requiresSource,
  getCategory,
  listToolsByCategory,
  listToolSchemas
};
