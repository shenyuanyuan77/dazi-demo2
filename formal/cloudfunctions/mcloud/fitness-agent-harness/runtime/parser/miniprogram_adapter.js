const {
  AgentIntent,
  PendingWriteStatus,
  PendingWriteType
} = require("../../shared/types/agent_types.js");
const { RESPONSE_MODE } = require("../bootstrap/agent.config.js");
const { enforceAnswerContract } = require("../validators/answer_contract.js");

function answerType(intent) {
  if (intent === AgentIntent.DIET_RECORD || intent === AgentIntent.DIET_SUGGESTION) return "diet";
  if (
    intent === AgentIntent.TRAINING_RECORD ||
    intent === AgentIntent.TRAINING_PLAN_CREATE ||
    intent === AgentIntent.TRAINING_PLAN_UPDATE
  ) return "training";
  return "general";
}

function answerTitle(intent) {
  const map = {
    [AgentIntent.DIET_RECORD]: "饮食记录确认",
    [AgentIntent.DIET_SUGGESTION]: "饮食建议",
    [AgentIntent.TRAINING_PLAN_CREATE]: "训练计划确认",
    [AgentIntent.TRAINING_RECORD]: "训练记录确认",
    [AgentIntent.TRAINING_PLAN_UPDATE]: "训练计划修改确认",
    [AgentIntent.BODY_ANALYSIS]: "身体数据分析",
    [AgentIntent.CONFIRM_WRITE]: "写入结果",
    [AgentIntent.CANCEL_WRITE]: "已取消",
    [AgentIntent.UNSUPPORTED]: "暂不支持"
  };
  return map[intent] || "AI 教练";
}

function compactHarnessResult(result) {
  return {
    intent: result.intent,
    slots: result.slots || {},
    guardrailResult: result.guardrailResult,
    validationResult: result.validationResult,
    pendingWrite: result.pendingWrite || null,
    toolCalls: (result.toolCalls || []).map(call => ({
      id: call.id,
      name: call.name,
      permissionLevel: call.permissionLevel,
      requiresConfirmation: call.requiresConfirmation,
      ok: Boolean(call.result && call.result.ok),
      error: call.result && call.result.error || null
    })),
    memoryUpdates: result.memoryUpdates || [],
    contextKeys: result.contextUsed && result.contextUsed.keys || [],
    trace: (result.trace || []).slice(-30)
  };
}

function proposalFromPendingWrite(pendingWrite) {
  if (!pendingWrite || pendingWrite.status !== PendingWriteStatus.WAITING_CONFIRM) return null;
  const data = pendingWrite.data || {};
  if (pendingWrite.type === PendingWriteType.DIET_LOG) {
    return {
      id: pendingWrite.id,
      type: "dietLog",
      status: "pending",
      summary: pendingWrite.summaryForUser || "将这条饮食信息写入记录",
      payload: {
        date: data.date,
        meal: data.meal || "",
        items: data.items || [],
        source: data.source || "chat",
        harnessWriteType: pendingWrite.type,
        pendingWriteId: pendingWrite.id
      }
    };
  }
  if (pendingWrite.type === PendingWriteType.TRAINING_LOG) {
    return {
      id: pendingWrite.id,
      type: "workoutPlan",
      status: "pending",
      summary: pendingWrite.summaryForUser || "将这条训练信息写入训练记录",
      payload: {
        date: data.date,
        operation: "log",
        writeMode: "append",
        planName: "训练记录",
        exercises: (data.items || []).map((item, index) => ({
          id: `${pendingWrite.id}-${index + 1}`,
          name: item.exerciseName || "训练动作",
          subtitle: [
            item.sets ? `${item.sets} 组` : "",
            item.reps ? `每组 ${item.reps} 次` : "",
            item.weightKg ? `${item.weightKg} kg` : "",
            item.durationMin ? `${item.durationMin} 分钟` : ""
          ].filter(Boolean).join("，"),
          sets: [{
            setIndex: 1,
            weight: item.weightKg === undefined ? "" : String(item.weightKg),
            reps: item.reps === undefined ? (item.durationMin ? `${item.durationMin}分钟` : "") : String(item.reps),
            restSeconds: 60
          }]
        })),
        harnessWriteType: pendingWrite.type,
        pendingWriteId: pendingWrite.id
      }
    };
  }
  if (pendingWrite.type === PendingWriteType.TRAINING_PLAN) {
    return {
      id: pendingWrite.id,
      type: "workoutPlan",
      status: "pending",
      summary: pendingWrite.summaryForUser || "将训练计划写入记录",
      payload: Object.assign({}, data, {
        writeMode: data.operation === "update" ? "replace" : (data.writeMode || "week"),
        harnessWriteType: pendingWrite.type,
        pendingWriteId: pendingWrite.id
      })
    };
  }
  if (pendingWrite.type === PendingWriteType.BODY_METRIC) {
    return {
      id: pendingWrite.id,
      type: "profilePatch",
      status: "pending",
      summary: pendingWrite.summaryForUser || "将身体数据写入记录",
      payload: {
        date: data.date,
        profilePatch: data.metrics || {},
        source: data.source || "chat",
        harnessWriteType: pendingWrite.type,
        pendingWriteId: pendingWrite.id
      }
    };
  }
  if (pendingWrite.type === PendingWriteType.USER_PROFILE) {
    return {
      id: pendingWrite.id,
      type: "profilePatch",
      status: "pending",
      summary: pendingWrite.summaryForUser || "更新用户画像",
      payload: {
        profilePatch: data.profilePatch || {},
        source: data.source || "chat",
        harnessWriteType: pendingWrite.type,
        pendingWriteId: pendingWrite.id
      }
    };
  }
  return null;
}

function mergeProposals(existing, harnessProposal, preferHarness) {
  const proposals = Array.isArray(existing) ? existing.slice() : [];
  if (!harnessProposal) return proposals;
  const withoutSame = proposals.filter(item => item && item.id !== harnessProposal.id);
  return preferHarness
    ? [harnessProposal].concat(withoutSame).slice(0, 3)
    : withoutSame.concat(harnessProposal).slice(0, 3);
}

function toMiniProgramAnswer(result) {
  const harness = compactHarnessResult(result);
  const proposal = proposalFromPendingWrite(result.pendingWrite);
  return enforceAnswerContract({
    type: answerType(result.intent),
    title: answerTitle(result.intent),
    content: result.reply || "",
    payload: {
      proposals: proposal ? [proposal] : [],
      agentHarness: harness,
      agentState: {
        currentTask: {
          intent: result.intent,
          step: proposal ? "awaiting_confirmation" : "answered"
        },
        pendingWrite: result.pendingWrite || null,
        validationResult: result.validationResult
      }
    },
    memory: {},
    safety: {
      level: result.validationResult && result.validationResult.passed ? "none" : "caution",
      message: result.validationResult && result.validationResult.errors
        ? result.validationResult.errors.join("；")
        : ""
    },
    model: "agent-harness",
    requestId: ""
  }, result);
}

function mergeModelAnswer(answer, result) {
  if (!answer || typeof answer !== "object") return toMiniProgramAnswer(result);
  const payload = Object.assign({}, answer.payload || {});
  const harness = compactHarnessResult(result);
  const proposal = proposalFromPendingWrite(result.pendingWrite);
  const preferHarnessProposal = Boolean(proposal && result.pendingWrite);
  payload.proposals = mergeProposals(payload.proposals, proposal, preferHarnessProposal);
  payload.agentHarness = harness;
  payload.agentState = Object.assign({}, payload.agentState || {}, {
    currentTask: {
      intent: result.intent,
      step: proposal ? "awaiting_confirmation" : "answered"
    },
    pendingWrite: result.pendingWrite || null,
    validationResult: result.validationResult
  });
  let content = String(answer.content || "").trim();
  if (result.intent === AgentIntent.UNSUPPORTED || result.responseMode === RESPONSE_MODE.SHORT_CIRCUIT) {
    content = result.reply || content;
  }
  return enforceAnswerContract(Object.assign({}, answer, {
    type: answer.type || answerType(result.intent),
    title: answer.title || answerTitle(result.intent),
    content,
    payload,
    safety: Object.assign({}, answer.safety || {}, {
      harnessValidation: result.validationResult
    })
  }), result);
}

function shouldShortCircuit(result) {
  return result && result.responseMode === RESPONSE_MODE.SHORT_CIRCUIT;
}

module.exports = {
  compactHarnessResult,
  mergeModelAnswer,
  proposalFromPendingWrite,
  shouldShortCircuit,
  toMiniProgramAnswer
};
