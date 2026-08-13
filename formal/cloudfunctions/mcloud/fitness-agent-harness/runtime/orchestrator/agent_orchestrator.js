const {
  AgentIntent,
  PendingWriteStatus,
  PendingWriteType
} = require("../../shared/types/agent_types.js");
const { createId } = require("../../shared/utils/id.js");
const { cloneJson } = require("../../shared/utils/object.js");
const {
  RESPONSE_MODE,
  MODEL_ASSISTED_INTENTS,
  WRITE_CONFIRMATION_TTL_MINUTES,
  recommendPath
} = require("../bootstrap/agent.config.js");
const { inputGuardrail } = require("../guardrails/guardrails.js");
const { classifyMemoryUpdate } = require("../memory/memory_policy.js");
const { appendTurn } = require("../memory/shortTermMemory.js");
const { buildSystemPrompt, buildRagAugmentedPrompt } = require("../prompt/prompt_builder.js");
const { recognizeIntent, recognizeIntentWithLLM } = require("../parser/intent_parser.js");
const { parseSlots } = require("../parser/slot_parser.js");
const { selectContext } = require("../context/context_policy.js");
const { ToolRegistry } = require("../tools/tool_registry.js");
const { getToolSchema } = require("../tools/tool_schemas.js");
const validators = require("../validators/validators.js");
const { toAgentError } = require("../errors/agent_errors.js");
const {
  addError,
  addMemoryRead,
  addMemoryWrite,
  addToolCall,
  compactState,
  createInitialState
} = require("../state/state_store.js");
const { expiresInMinutes, isExpired, isoNow } = require("../../shared/utils/date.js");
const { createTrace } = require("../observability/trace.js");
const DietAgent = require("../subagents/diet_agent.js");
const TrainingAgent = require("../subagents/training_agent.js");
const BodyAgent = require("../subagents/body_agent.js");
const FallbackAgent = require("../subagents/fallback_agent.js");

class AgentOrchestrator {
  constructor(options) {
    this.toolRegistry = new ToolRegistry(options && options.toolHandlers);
    this.defaultNow = options && options.now;
    // [方案A] LLM intent fallback caller (可选, 注入式解耦)
    // 签名: async (systemPrompt, userPrompt) => string
    this.llmCaller = options && options.llmCaller || null;
  }

  async runTurn(input) {
    const now = this._resolveNow(input && input.now);
    const trace = createTrace({
      requestId: input && input.requestId,
      userId: input && input.userId,
      sessionId: input && input.sessionId
    });
    const state = createInitialState(input || {});
    const message = String(input && input.message || "").trim();
    const hasImages = Boolean(input && (
      input.hasImages ||
      (input.images && input.images.length) ||
      (input.imageData && input.imageData.length)
    ));
    trace.event("turn.start", { hasImages, messageLength: message.length });
    const toolContext = {
      userId: state.userId,
      sessionId: state.sessionId,
      profile: state.userProfile,
      images: input && (input.images || input.imageData || []),
      db: input && input.db,
      now
    };
    const resultBase = {
      reply: "",
      intent: AgentIntent.UNSUPPORTED,
      slots: {},
      toolCalls: [],
      memoryUpdates: [],
      guardrailResult: { allowed: true },
      validationResult: { passed: true, errors: [] },
      confirmedByUser: false,
      contextUsed: { keys: [], data: {} },
      trace: trace.render().events,
      traceMeta: trace.render(),
      route: "fast",
      responseMode: RESPONSE_MODE.SHORT_CIRCUIT,
      requestId: trace.requestId
    };

    this._trace(trace, "input.received", { hasImages, messageLength: message.length });
    const guardrailResult = inputGuardrail(message || (hasImages ? "图片输入" : ""));
    resultBase.guardrailResult = guardrailResult;
    if (!guardrailResult.allowed) {
      trace.warning("input.guardrail_rejected", { reason: guardrailResult.reason });
      const result = Object.assign({}, resultBase, {
        reply: guardrailResult.reply,
        validationResult: { passed: false, errors: [guardrailResult.reason] }
      });
      return this._finalize(state, result, message, now, trace);
    }

    const intentInfo = await recognizeIntentWithLLM(message, {
      hasImages,
      pendingWrite: state.pendingWrite
    }, this.llmCaller);
    const intent = intentInfo.intent;
    const slots = parseSlots(intent, message, { hasImages, now });
    this._trace(trace, "intent.recognized", intentInfo);
    this._trace(trace, "slots.parsed", slots);

    const contextUsed = selectContext(intent, state, state.episodicMemory);
    addMemoryRead(state, {
      intent,
      keys: contextUsed.keys
    });
    this._trace(trace, "context.selected", { keys: contextUsed.keys });
    // RAG：仅 deep 路径才检索，避免给短回答增加噪声
    let ragAugmented = false;
    let ragHits = [];
    if (MODEL_ASSISTED_INTENTS.includes(intent)) {
      try {
        const augmented = await buildRagAugmentedPrompt(contextUsed, {
          query: message,
          useRag: true,
          topK: 5
        });
        if (augmented && augmented.length > 0) {
          ragAugmented = true;
          // 不直接覆盖 prompt_builder 输出，留给 service 层按需采用
          ragHits = [];
        }
      } catch (err) {
        trace.warning("rag.failed", { message: err.message });
      }
      this._trace(trace, "rag.augmented", { enabled: ragAugmented });
      buildSystemPrompt(contextUsed);
    } else {
      buildSystemPrompt(contextUsed);
    }

    let result = Object.assign({}, resultBase, {
      intent,
      slots,
      contextUsed,
      responseMode: this._defaultResponseMode(intent, slots)
    });

    if (intent === AgentIntent.CONFIRM_WRITE) {
      result = await this._confirmWrite(result, state, toolContext, now, trace);
      return this._finalize(state, result, message, now, trace);
    }

    if (intent === AgentIntent.CANCEL_WRITE) {
      result = this._cancelWrite(result, state, trace);
      return this._finalize(state, result, message, now, trace);
    }

    if (intent === AgentIntent.UNSUPPORTED) {
      result.reply = FallbackAgent.buildUnsupportedResult().reply;
      result.responseMode = RESPONSE_MODE.SHORT_CIRCUIT;
      return this._finalize(state, result, message, now, trace);
    }

    if (intent === AgentIntent.DIET_RECORD) {
      result = await this._handleDietRecord(result, state, toolContext, hasImages, now, trace);
    } else if (intent === AgentIntent.DIET_SUGGESTION) {
      result = await this._handleDietSuggestion(result, state, toolContext, trace);
    } else if (intent === AgentIntent.TRAINING_RECORD) {
      result = this._handleTrainingRecord(result, state, now, trace);
    } else if (intent === AgentIntent.TRAINING_PLAN_CREATE) {
      result = this._handleTrainingPlanCreate(result, state, now, trace);
    } else if (intent === AgentIntent.TRAINING_PLAN_UPDATE) {
      result = await this._handleTrainingPlanUpdate(result, state, toolContext, now, trace);
    } else if (intent === AgentIntent.BODY_ANALYSIS) {
      result = await this._handleBodyAnalysis(result, state, toolContext, hasImages, now, trace);
    }

    return this._finalize(state, result, message, now, trace);
  }

  _resolveNow(value) {
    if (value instanceof Date) return value;
    if (this.defaultNow instanceof Date) return this.defaultNow;
    if (typeof value === "string" || typeof value === "number") {
      const date = new Date(value);
      if (Number.isFinite(date.getTime())) return date;
    }
    return new Date();
  }

  _defaultResponseMode(intent, slots) {
    if (intent === AgentIntent.DIET_RECORD || intent === AgentIntent.TRAINING_RECORD) {
      return RESPONSE_MODE.SHORT_CIRCUIT;
    }
    if (intent === AgentIntent.BODY_ANALYSIS && slots && Object.keys(slots.metrics || {}).length) {
      return RESPONSE_MODE.SHORT_CIRCUIT;
    }
    return MODEL_ASSISTED_INTENTS.includes(intent)
      ? RESPONSE_MODE.CALL_MODEL
      : RESPONSE_MODE.SHORT_CIRCUIT;
  }

  _resolveRoute(intent, extra) {
    const decision = recommendPath(intent, extra || {});
    if (decision.path === "deep") return Object.assign({}, decision, { responseMode: RESPONSE_MODE.CALL_MODEL });
    return Object.assign({}, decision, { responseMode: RESPONSE_MODE.SHORT_CIRCUIT });
  }

  async _callTool(result, state, context, name, input, trace) {
    const schema = getToolSchema(name) || {};
    const call = {
      id: createId("tool"),
      name,
      input: cloneJson(input || {}, {}),
      permissionLevel: schema.permissionLevel || "",
      requiresConfirmation: Boolean(schema.requiresConfirmation),
      category: schema.category || "unknown",
      timeoutMs: schema.timeoutMs || 3000,
      idempotent: Boolean(schema.idempotent),
      sensitiveFields: schema.sensitiveFields || [],
      at: new Date().toISOString()
    };
    this._trace(result.trace, "tool.call", { name, permissionLevel: call.permissionLevel, category: call.category });
    const startedAt = Date.now();
    let callResult;
    try {
      const timeoutMs = call.timeoutMs;
      callResult = await Promise.race([
        Promise.resolve(this.toolRegistry.call(name, input, context)),
        new Promise((_, reject) => setTimeout(() => reject(new Error("TOOL_TIMEOUT")), timeoutMs))
      ]);
    } catch (err) {
      const message = String(err && err.message || err);
      const isTimeout = message === "TOOL_TIMEOUT";
      callResult = { ok: false, error: { code: isTimeout ? "TOOL_TIMEOUT" : "TOOL_EXCEPTION", message: isTimeout ? "工具执行超时" : message.slice(0, 240) } };
    }
    const durationMs = Date.now() - startedAt;
    call.result = callResult;
    call.durationMs = durationMs;
    result.toolCalls.push(call);
    if (trace) {
      trace.tool(name, {
        ok: callResult && callResult.ok === true,
        durationMs,
        outcome: callResult && callResult.ok === false ? "error" : "ok",
        errorCode: callResult && callResult.error && callResult.error.code
      });
    }
    addToolCall(state, {
      name,
      permissionLevel: call.permissionLevel,
      requiresConfirmation: call.requiresConfirmation,
      ok: Boolean(call.result && call.result.ok)
    });
    if (call.result && call.result.ok === false) {
      addError(state, toAgentError({
        code: call.result.error && call.result.error.code || "TOOL_FAILED",
        message: call.result.error && call.result.error.message || "工具调用失败"
      }, "tool"));
    }
    return call.result;
  }

  _createPendingWrite(result, state, partial, now) {
    const pendingWrite = Object.assign({}, partial, {
      id: createId("pending-write"),
      status: PendingWriteStatus.WAITING_CONFIRM,
      createdAt: isoNow(now),
      expiresAt: expiresInMinutes(WRITE_CONFIRMATION_TTL_MINUTES, now)
    });
    result.pendingWrite = pendingWrite;
    result.memoryUpdates = classifyMemoryUpdate(pendingWrite);
    state.pendingWrite = pendingWrite;
    addMemoryWrite(state, {
      target: pendingWrite.target,
      action: "pending",
      pendingWriteId: pendingWrite.id
    });
    this._trace(result.trace, "pending_write.created", {
      type: pendingWrite.type,
      target: pendingWrite.target,
      expiresAt: pendingWrite.expiresAt
    });
    return pendingWrite;
  }

  async _handleDietRecord(result, state, context, hasImages, now, trace) {
    if (hasImages) {
      const visionResult = await this._callTool(result, state, context, "vision.food.recognize", {
        userId: state.userId,
        images: context.images || []
      }, trace);
      if (visionResult && visionResult.ok && visionResult.data && Array.isArray(visionResult.data.items)) {
        result.slots.items = visionResult.data.items;
      }
    }
    this._createPendingWrite(result, state, DietAgent.buildDietRecordPending(result.slots), now);
    result.reply = DietAgent.buildDietRecordReply(result.slots);
    result.responseMode = RESPONSE_MODE.SHORT_CIRCUIT;
    result.route = "fast";
    return result;
  }

  async _handleDietSuggestion(result, state, context, trace) {
    if (result.slots && result.slots.hasImages) {
      await this._callTool(result, state, context, "vision.food.recognize", {
        userId: state.userId,
        images: context.images || []
      }, trace);
    }
    const profileResult = await this._callTool(result, state, context, "user.profile.get", {
      userId: state.userId
    }, trace);
    const dietResult = await this._callTool(result, state, context, "diet.log.query", {
      userId: state.userId,
      date: result.slots.date,
      limit: 20
    }, trace);
    const trainingResult = await this._callTool(result, state, context, "training.log.query", {
      userId: state.userId,
      date: result.slots.date,
      limit: 20
    }, trace);
    const analyzeResult = await this._callTool(result, state, context, "diet.analyze", {
      userId: state.userId,
      profile: profileResult && profileResult.data && profileResult.data.profile || state.userProfile,
      dietLogs: dietResult && dietResult.data && dietResult.data.list || [],
      trainingLogs: trainingResult && trainingResult.data && trainingResult.data.list || []
    }, trace);
    result.reply = `${result.slots && result.slots.writeDenied ? "我不会写入记录。" : ""}${DietAgent.buildDietSuggestionReply(analyzeResult)}`;
    result.route = "deep";
    return result;
  }

  _handleTrainingRecord(result, state, now, trace) {
    this._createPendingWrite(result, state, TrainingAgent.buildTrainingLogPending(result.slots), now);
    result.reply = TrainingAgent.buildTrainingLogReply(result.slots);
    result.responseMode = RESPONSE_MODE.SHORT_CIRCUIT;
    result.route = "fast";
    return result;
  }

  _handleTrainingPlanCreate(result, state, now, trace) {
    this._createPendingWrite(result, state, TrainingAgent.buildTrainingPlanPending(result.slots, "create"), now);
    result.reply = TrainingAgent.buildTrainingPlanReply(result.slots, "create");
    result.route = "deep";
    return result;
  }

  async _handleTrainingPlanUpdate(result, state, context, now, trace) {
    await this._callTool(result, state, context, "training.plan.get", {
      userId: state.userId,
      date: result.slots.date,
      limit: 5
    }, trace);
    this._createPendingWrite(result, state, TrainingAgent.buildTrainingPlanPending(result.slots, "update"), now);
    result.reply = TrainingAgent.buildTrainingPlanReply(result.slots, "update");
    result.route = "deep";
    return result;
  }

  async _handleBodyAnalysis(result, state, context, hasImages, now, trace) {
    if (hasImages) {
      const ocrResult = await this._callTool(result, state, context, "vision.bodyScale.ocr", {
        userId: state.userId,
        images: context.images || []
      }, trace);
      if (ocrResult && ocrResult.ok && ocrResult.data && ocrResult.data.metrics &&
          Object.keys(ocrResult.data.metrics).length) {
        result.slots.metrics = Object.assign({}, result.slots.metrics || {}, ocrResult.data.metrics);
      }
    }
    if (BodyAgent.hasBodyMetrics(result.slots) && result.slots.writeDenied) {
      result.reply = BodyAgent.buildBodyReadOnlyReply(result.slots);
      result.responseMode = RESPONSE_MODE.SHORT_CIRCUIT;
      result.route = "fast";
      return result;
    }
    if (BodyAgent.hasBodyMetrics(result.slots)) {
      this._createPendingWrite(result, state, BodyAgent.buildBodyMetricPending(result.slots), now);
      result.reply = BodyAgent.buildBodyAnalysisReply(result.slots);
      result.responseMode = RESPONSE_MODE.SHORT_CIRCUIT;
      result.route = "fast";
      return result;
    }
    const metricResult = await this._callTool(result, state, context, "body.metric.query", {
      userId: state.userId,
      limit: 20
    }, trace);
    const analyzeResult = await this._callTool(result, state, context, "body.analyze", {
      userId: state.userId,
      profile: state.userProfile,
      metrics: metricResult && metricResult.data && metricResult.data.list || []
    }, trace);
    result.reply = BodyAgent.buildBodyAnalysisReply(result.slots, analyzeResult);
    result.route = "deep";
    return result;
  }

  async _confirmWrite(result, state, context, now, trace) {
    const pendingWrite = state.pendingWrite;
    result.confirmedByUser = true;
    result.responseMode = RESPONSE_MODE.SHORT_CIRCUIT;
    result.route = "fast";
    if (!pendingWrite || pendingWrite.status === PendingWriteStatus.CONFIRMED ||
        pendingWrite.status === PendingWriteStatus.CANCELLED) {
      result.reply = "当前没有等待确认的写入项。请先告诉我你要记录或修改的健康信息。";
      return result;
    }
    if (isExpired(pendingWrite.expiresAt, now)) {
      pendingWrite.status = PendingWriteStatus.EXPIRED;
      result.pendingWrite = pendingWrite;
      result.reply = "这条待确认写入已经过期。请重新发送要记录的内容，我会重新生成待确认项。";
      return result;
    }

    const tool = this._writeToolForPending(pendingWrite);
    if (!tool) {
      pendingWrite.status = PendingWriteStatus.FAILED;
      result.pendingWrite = pendingWrite;
      result.reply = "这条待确认项没有可用写入工具，未执行写入。";
      return result;
    }
    const toolResult = await this._callTool(result, state, context, tool.name, tool.input, trace);
    if (!toolResult || toolResult.ok === false) {
      pendingWrite.status = PendingWriteStatus.FAILED;
      result.pendingWrite = pendingWrite;
      state.pendingWrite = pendingWrite;
      result.reply = "写入工具暂时失败，待确认项已保留。你可以稍后再次发送“确认”重试。";
      return result;
    }
    pendingWrite.status = PendingWriteStatus.CONFIRMED;
    result.pendingWrite = pendingWrite;
    state.pendingWrite = pendingWrite;
    addMemoryWrite(state, {
      target: pendingWrite.target,
      action: "confirmed",
      pendingWriteId: pendingWrite.id,
      tool: tool.name
    });
    result.reply = this._confirmedReply(pendingWrite);
    return result;
  }

  _cancelWrite(result, state, trace) {
    result.responseMode = RESPONSE_MODE.SHORT_CIRCUIT;
    result.route = "fast";
    if (!state.pendingWrite || state.pendingWrite.status !== PendingWriteStatus.WAITING_CONFIRM) {
      result.reply = "当前没有需要取消的待确认写入项。";
      return result;
    }
    state.pendingWrite.status = PendingWriteStatus.CANCELLED;
    result.pendingWrite = state.pendingWrite;
    addMemoryWrite(state, {
      target: state.pendingWrite.target,
      action: "cancelled",
      pendingWriteId: state.pendingWrite.id
    });
    result.reply = "已取消这条待确认写入，未写入任何数据。";
    return result;
  }

  _writeToolForPending(pendingWrite) {
    const data = pendingWrite.data || {};
    if (pendingWrite.type === PendingWriteType.DIET_LOG) {
      return { name: "diet.log.create", input: data };
    }
    if (pendingWrite.type === PendingWriteType.TRAINING_LOG) {
      return { name: "training.log.create", input: data };
    }
    if (pendingWrite.type === PendingWriteType.TRAINING_PLAN) {
      return {
        name: data.operation === "update" ? "training.plan.update" : "training.plan.create",
        input: data.operation === "update"
          ? { userId: data.userId, date: data.date, patch: data.patch || data, source: data.source }
          : { userId: data.userId, date: data.date, plan: data, source: data.source }
      };
    }
    if (pendingWrite.type === PendingWriteType.BODY_METRIC) {
      return {
        name: "body.metric.create",
        input: {
          userId: data.userId,
          date: data.date,
          metrics: data.metrics || {},
          source: data.source
        }
      };
    }
    if (pendingWrite.type === PendingWriteType.USER_PROFILE) {
      return {
        name: "user.profile.update",
        input: {
          userId: data.userId,
          profilePatch: data.profilePatch || {},
          source: data.source
        }
      };
    }
    return null;
  }

  _confirmedReply(pendingWrite) {
    if (pendingWrite.type === PendingWriteType.DIET_LOG) return "已记录到饮食记录。";
    if (pendingWrite.type === PendingWriteType.TRAINING_LOG) return "已记录到训练记录。";
    if (pendingWrite.type === PendingWriteType.TRAINING_PLAN) return "已保存训练计划。";
    if (pendingWrite.type === PendingWriteType.BODY_METRIC) return "已记录身体数据。";
    if (pendingWrite.type === PendingWriteType.USER_PROFILE) return "已更新用户画像。";
    return "已完成写入。";
  }

  _ensurePendingUserId(result, userId) {
    if (!result.pendingWrite || !result.pendingWrite.data) return;
    if (!result.pendingWrite.data.userId) result.pendingWrite.data.userId = userId;
  }

  _finalize(state, result, message, now, trace) {
    this._ensurePendingUserId(result, state.userId);
    if (state.pendingWrite && state.pendingWrite.data && !state.pendingWrite.data.userId) {
      state.pendingWrite.data.userId = state.userId;
    }
    const validationResult = validators.runValidators(result);
    result.validationResult = validationResult;
    if (!validationResult.passed) {
      validationResult.errors.forEach(message => addError(state, toAgentError({
        code: "VALIDATION_FAILED",
        message
      }, "validation")));
    }
    state.lastIntent = result.intent;
    state.shortTermMemory = appendTurn(state.shortTermMemory, message, result.reply);
    result.state = compactState(state);
    // 兼容老 test：result.trace 仍是数组（事件流），同时通过 traceMeta 提供结构化
    if (trace) {
      trace.event("turn.finalized", {
        intent: result.intent,
        validationPassed: result.validationResult.passed,
        toolCallCount: result.toolCalls.length,
        hasPendingWrite: Boolean(result.pendingWrite),
        route: result.route
      });
      trace.finish({ intent: result.intent, route: result.route });
      result.trace = trace.render().events;
      result.traceMeta = trace.render();
      result.requestId = trace.requestId;
    } else {
      result.trace = result.trace.concat({
        phase: "turn.finalized",
        at: isoNow(now),
        data: {
          intent: result.intent,
          validationPassed: result.validationResult.passed,
          toolCallCount: result.toolCalls.length,
          hasPendingWrite: Boolean(result.pendingWrite)
        }
      });
    }
    return result;
  }

  _trace(trace, phase, data) {
    if (trace && typeof trace.event === "function") {
      trace.event(phase, data);
      return;
    }
    // 兼容老接口：trace 可能是普通数组
    trace.push({
      phase,
      at: new Date().toISOString(),
      data: cloneJson(data || {}, {})
    });
  }
}

module.exports = AgentOrchestrator;
