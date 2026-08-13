const { AgentIntent } = require("../../shared/types/agent_types.js");

const WRITE_CONFIRMATION_TTL_MINUTES = 30;

const SUPPORTED_CAPABILITIES = Object.freeze([
  "饮食记录",
  "饮食建议",
  "训练计划制定",
  "训练记录",
  "训练计划修改",
  "身体数据分析"
]);

const RESPONSE_MODE = Object.freeze({
  SHORT_CIRCUIT: "short_circuit",
  CALL_MODEL: "call_model"
});

const CONFIRMATION_WORDS = Object.freeze([
  "确认",
  "可以",
  "没问题",
  "保存",
  "写入",
  "记上",
  "就这样",
  "对"
]);

const CANCEL_WORDS = Object.freeze([
  "取消",
  "不用",
  "不要",
  "算了",
  "不保存",
  "先别",
  "否"
]);

const READ_INTENTS = Object.freeze([
  AgentIntent.DIET_SUGGESTION,
  AgentIntent.BODY_ANALYSIS
]);

/**
 * 需要走 LLM 拼装自由文案的 intent（深度路径）。
 * 注意：写操作（DIET_RECORD / TRAINING_RECORD / *_PLAN_*）必须 short-circuit，
 * 任何"看起来成功"的自然语言都得在 `_confirmedReply` / 写后端兜底，绝不让模型自夸。
 */
const MODEL_ASSISTED_INTENTS = Object.freeze([
  AgentIntent.DIET_SUGGESTION,
  AgentIntent.TRAINING_PLAN_CREATE,
  AgentIntent.TRAINING_PLAN_UPDATE,
  AgentIntent.BODY_ANALYSIS
]);

/**
 * 路由策略：决定某个 intent 在默认情况下走 短路径 还是 深度路径。
 * 设计目的：
 *   - 把"短答复+确定性"的操作（写卡片、确认/取消、UNSUPPORTED）放到 SHORT_CIRCUIT，
 *     减少模型往返、降低幻觉面。
 *   - 训练计划/分析类放 CALL_MODEL，让模型拼装说明 + 引用官方来源。
 */
const ROUTE_POLICY = Object.freeze({
  fast: Object.freeze({
    name: "fast",
    intents: Object.freeze([
      AgentIntent.DIET_RECORD,
      AgentIntent.TRAINING_RECORD,
      AgentIntent.CONFIRM_WRITE,
      AgentIntent.CANCEL_WRITE,
      AgentIntent.UNSUPPORTED
    ]),
    reason: "deterministic_or_short_reply"
  }),
  deep: Object.freeze({
    name: "deep",
    intents: Object.freeze([
      AgentIntent.DIET_SUGGESTION,
      AgentIntent.TRAINING_PLAN_CREATE,
      AgentIntent.TRAINING_PLAN_UPDATE,
      AgentIntent.BODY_ANALYSIS
    ]),
    reason: "needs_model_assembly"
  })
});

/**
 * 给定 intent 返回推荐路径。"confirm_without_pending_write" 这种边界走 fast 兜底。
 */
function recommendPath(intent, extra) {
  if (extra && extra.confirmWithoutPending) {
    return { path: "fast", reason: "confirm_without_pending_write", responseMode: RESPONSE_MODE.SHORT_CIRCUIT };
  }
  if (ROUTE_POLICY.fast.intents.indexOf(intent) >= 0) {
    return { path: "fast", reason: ROUTE_POLICY.fast.reason, responseMode: RESPONSE_MODE.SHORT_CIRCUIT };
  }
  if (ROUTE_POLICY.deep.intents.indexOf(intent) >= 0) {
    return { path: "deep", reason: ROUTE_POLICY.deep.reason, responseMode: RESPONSE_MODE.CALL_MODEL };
  }
  return { path: "fast", reason: "default", responseMode: RESPONSE_MODE.SHORT_CIRCUIT };
}

module.exports = {
  CANCEL_WORDS,
  CONFIRMATION_WORDS,
  MODEL_ASSISTED_INTENTS,
  READ_INTENTS,
  RESPONSE_MODE,
  ROUTE_POLICY,
  SUPPORTED_CAPABILITIES,
  WRITE_CONFIRMATION_TTL_MINUTES,
  recommendPath
};