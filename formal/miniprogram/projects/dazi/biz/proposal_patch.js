const goalConfig = require("../config/goal_config.js");
const aiResponseFallback = require("./ai_response_fallback.js");
const validators = require("./validators.js");

function clone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function looksLikeProposalPatch(message, pendingProposal) {
  if (!pendingProposal) return false;
  const text = String(message || "").trim();
  if (!text) return false;
  if (/(保存到明天|安排到明天|改成明天|明天再练|明天再做)/.test(text)) return true;
  if (/(每个项目|每个动作|每一项|每项).{0,6}\d+\s*组/.test(text)) return true;
  if (/(改成|改为|换成|换为).{0,4}(练腿|练胸|练背|练肩|练手臂|练核心|全身)/.test(text)) return true;
  if (/(不要|去掉|删掉).{0,8}/.test(text)) return true;
  if (pendingProposal.type === "workoutPlan" && /(\d+)\s*组/.test(text) && !/(今天做了|记录训练|训练记录)/.test(text)) {
    return true;
  }
  return false;
}

function buildSetTemplate(source, index) {
  const base = source || {};
  return {
    setIndex: index + 1,
    weight: base.weight === undefined ? "" : base.weight,
    reps: base.reps === undefined ? "10" : String(base.reps),
    restSeconds: Math.max(0, Number(base.restSeconds) || 60),
    completed: false
  };
}

function patchWorkoutSets(proposal, setCount) {
  const next = clone(proposal);
  next.payload = Object.assign({}, next.payload, {
    exercises: (next.payload.exercises || []).map(exercise => {
      const sourceSets = Array.isArray(exercise.sets) ? exercise.sets : [];
      const fallbackSet = sourceSets[sourceSets.length - 1] || { reps: "10", restSeconds: 60, weight: "" };
      const sets = Array.from({ length: setCount }, (_, index) => (
        buildSetTemplate(sourceSets[index] || fallbackSet, index)
      ));
      return Object.assign({}, exercise, { sets });
    })
  });
  next.summary = `已将每个动作调整为 ${setCount} 组`;
  return {
    applied: true,
    proposal: next,
    message: `已把这份训练草稿改成每个动作 ${setCount} 组，你可以继续检查后再保存。`
  };
}

function patchWorkoutFocus(proposal, message, context) {
  const next = clone(proposal);
  const profile = context && context.userProfile || {};
  const goal = goalConfig.normalizeGoal(profile.goal);
  const exercises = aiResponseFallback.workoutExercises(goal, message);
  const focus = /练腿/.test(message)
    ? "练腿"
    : (/练胸/.test(message)
      ? "练胸"
      : (/练背/.test(message)
        ? "练背"
        : (/练肩/.test(message)
          ? "练肩"
          : (/练手臂/.test(message)
            ? "练手臂"
            : (/核心/.test(message) ? "核心" : "全身")))));
  next.payload = Object.assign({}, next.payload, {
    planName: `${focus}训练计划`,
    targetMuscleGroups: Array.from(new Set(exercises.reduce((list, item) => (
      list.concat(item.muscleGroups || [])
    ), []))),
    exercises
  });
  next.summary = `已改成${focus}训练计划`;
  return {
    applied: true,
    proposal: next,
    message: `已把待确认草稿改成${focus}训练计划，你可以直接继续确认。`
  };
}

function patchWorkoutRemoval(proposal, message) {
  const next = clone(proposal);
  const nameMatch = String(message || "").match(/(?:不要|去掉|删掉)([^，。,\s]{1,12})/);
  const keyword = String(nameMatch && nameMatch[1] || "").trim();
  if (!keyword) return { applied: false, reason: "missing_exercise_keyword" };
  const exercises = (next.payload.exercises || []).filter(exercise => !String(exercise.name || "").includes(keyword));
  if (!exercises.length || exercises.length === (next.payload.exercises || []).length) {
    return { applied: false, reason: "exercise_not_found" };
  }
  next.payload = Object.assign({}, next.payload, { exercises });
  next.summary = `已移除 ${keyword}`;
  return {
    applied: true,
    proposal: next,
    message: `已从这份训练草稿里移除“${keyword}”，你可以继续确认保存。`
  };
}

function patchProposalDate(proposal, nextDate) {
  const next = clone(proposal);
  next.uiDate = nextDate;
  next.payload = Object.assign({}, next.payload, { date: nextDate });
  if (next.type === "workoutPlan") next.uiWriteMode = "append";
  return {
    applied: true,
    proposal: next,
    message: `已把这张待确认草稿安排到 ${nextDate}。`
  };
}

function applyPendingProposalPatch(pendingProposal, message, context = {}) {
  if (!pendingProposal) return { applied: false, reason: "missing_pending_proposal" };
  const proposal = clone(pendingProposal);
  const text = String(message || "").trim();
  if (!looksLikeProposalPatch(text, proposal)) {
    return { applied: false, reason: "not_patch_request" };
  }
  if (/(保存到明天|安排到明天|改成明天|明天再练|明天再做)/.test(text)) {
    return patchProposalDate(proposal, context.tomorrowKey);
  }
  if (proposal.type === "workoutPlan") {
    const setMatch = text.match(/(\d+)\s*组/);
    if (setMatch && /(每个项目|每个动作|每一项|每项|改成|改为|还是)/.test(text)) {
      return patchWorkoutSets(proposal, Math.max(1, Number(setMatch[1]) || 1));
    }
    if (/(改成|改为|换成|换为).{0,4}(练腿|练胸|练背|练肩|练手臂|练核心|全身)/.test(text)) {
      return patchWorkoutFocus(proposal, text, context);
    }
    if (/(不要|去掉|删掉)/.test(text)) {
      return patchWorkoutRemoval(proposal, text);
    }
  }
  const sanitizedExercises = proposal.type === "workoutPlan"
    ? validators.sanitizeWorkoutExercises(proposal.payload && proposal.payload.exercises)
    : [];
  if (proposal.type === "workoutPlan" && sanitizedExercises.length !== (proposal.payload.exercises || []).length) {
    proposal.payload = Object.assign({}, proposal.payload, { exercises: sanitizedExercises });
    return {
      applied: true,
      proposal,
      message: "我已清理掉不应该进入动作名称的意图语句，请继续确认这张训练草稿。"
    };
  }
  return { applied: false, reason: "patch_rule_not_matched" };
}

module.exports = {
  applyPendingProposalPatch,
  looksLikeProposalPatch
};
