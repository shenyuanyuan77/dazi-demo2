function routeIntent(message, context = {}) {
  const text = String(message || "");
  const quickAction = String(context.quickAction || "");
  const hasImages = Boolean(context.hasImages);
  const pendingType = context.pendingProposal && context.pendingProposal.type;

  if (pendingType && /(确认|保存|写入|添加|记一下|同步)/.test(text)) {
    return { intent: "confirm_pending_proposal", domain: "general", responseMode: "confirm", targetProposalType: pendingType, confidence: 0.98 };
  }

  if (pendingType && /(改成|换成|不是|我是说|调整|修改|做\d+组|练腿|练胸|练背|练肩)/.test(text)) {
    return { intent: "modify_pending_proposal", domain: pendingType === "workoutPlan" ? "training" : "general", responseMode: "modify_proposal", targetProposalType: pendingType, confidence: 0.9 };
  }

  if (quickAction === "拍照记饮食" || (hasImages && /(餐|饭|吃|饮食|食物|热量)/.test(text))) {
    return { intent: "diet_image_recognition", domain: "diet", responseMode: "generate_proposal", targetProposalType: "dietLog", confidence: 0.9 };
  }

  if (hasImages && /(体重|体脂|身体数据|围度|健康|手表|步数|睡眠)/.test(text)) {
    return { intent: "body_data_recognition", domain: "body", responseMode: "generate_proposal", targetProposalType: "profilePatch", confidence: 0.86 };
  }

  if (/(训练计划|训练安排|居家训练|练腿|练胸|练背|动作|组\s*[×xX]|休息\s*\d+|深蹲|俯卧撑|臀桥|平板支撑)/.test(text)) {
    return { intent: "workout_plan_generate", domain: "training", responseMode: "generate_proposal", targetProposalType: "workoutPlan", confidence: 0.92 };
  }

  if (/(早餐|午餐|晚餐|加餐|吃了|喝了|食物|餐食|鸡胸|米饭|牛奶|鸡蛋)/.test(text)) {
    return { intent: "diet_text_logging", domain: "diet", responseMode: "generate_proposal", targetProposalType: "dietLog", confidence: 0.88 };
  }

  if (/(体重|体脂|身高|目标体重|BMI)/.test(text)) {
    return { intent: "body_data_update", domain: "body", responseMode: "generate_proposal", targetProposalType: "profilePatch", confidence: 0.82 };
  }

  return { intent: "answer", domain: "general", responseMode: "answer_only", targetProposalType: "", confidence: 0.7 };
}

module.exports = { routeIntent };
