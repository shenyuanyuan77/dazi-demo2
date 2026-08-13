const ONBOARDING_FIELDS = Object.freeze([
  { key: "height", label: "身高", question: "你的身高是多少厘米？" },
  { key: "weight", label: "当前体重", question: "你现在体重大约多少公斤？" },
  { key: "targetWeight", label: "目标体重", question: "你的目标体重大约是多少公斤？" },
  { key: "age", label: "年龄", question: "你今年大概多大？" },
  { key: "sex", label: "性别", question: "你的生理性别是男还是女？这只用于估算基础代谢。" },
  { key: "activityLevel", label: "活动水平", question: "你平时的活动量更接近久坐、轻度活动、中度活动还是高度活动？" }
]);

const ACTIVITY_FACTORS = Object.freeze({
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
  very_high: 1.9
});

const SKILL_KNOWLEDGE = Object.freeze({
  calorieReference: [
    "白米饭熟100g约116kcal，鸡胸肉100g约133kcal，鸡蛋100g约144kcal，北豆腐100g约98kcal。",
    "外卖通常比自制同类食物高20%-40%热量，原因多为额外用油和酱料。",
    "奶茶全糖500ml常见约500-700kcal，无糖美式约10kcal。"
  ],
  exerciseReference: [
    "热量估算可参考 MET 公式：消耗(kcal)=MET*体重(kg)*时长(小时)。",
    "快走约4.5 MET，慢跑约7.0 MET，中等强度力量训练约5.0 MET，Tabata约13.5 MET。",
    "当日热量缺口超过600kcal时，不建议完全依赖补运动，优先同时调整饮食。"
  ],
  recipeReference: [
    "可优先推荐高蛋白、低油、可复制的家常选项，如黑椒鸡胸、凉拌鸡丝、番茄鸡蛋、冬瓜鸡胸丸子汤。",
    "外卖可优先推荐少油少酱、主食可减量的组合，如白切鸡套餐、清汤麻辣烫、轻食碗。",
    "如果用户明确想要菜谱或外卖建议，先结合今日剩余热量和蛋白缺口再给方案。"
  ],
  safetyReference: [
    "不建议长期低于女性1200kcal/天或男性1500kcal/天。",
    "BMI低于18.5或存在进食障碍风险时，应避免推动继续减重并建议专业支持。"
  ]
});

function normalizeObservation(memory = []) {
  return (Array.isArray(memory) ? memory : [])
    .map(item => {
      if (!item) return "";
      if (typeof item === "string") return item.trim();
      if (item.text) return String(item.text).trim();
      if (item.AI_LOG_DATA && item.AI_LOG_DATA.text) return String(item.AI_LOG_DATA.text).trim();
      return "";
    })
    .filter(Boolean)
    .slice(0, 5);
}

function summarizeProfile(profile = {}) {
  const parts = [];
  if (profile.height) parts.push(`身高${profile.height}cm`);
  if (profile.weight) parts.push(`当前体重${profile.weight}kg`);
  if (profile.targetWeight) parts.push(`目标体重${profile.targetWeight}kg`);
  if (profile.age) parts.push(`年龄${profile.age}`);
  if (profile.sex) parts.push(`性别${profile.sex}`);
  if (profile.activityLevel) parts.push(`活动水平${profile.activityLevel}`);
  if (profile.goal) parts.push(`目标${profile.goal}`);
  if (profile.exercisePreference) parts.push(`运动偏好${profile.exercisePreference}`);
  if (profile.recipePreference) parts.push(`饮食偏好${profile.recipePreference}`);
  return parts.length ? parts.join("；") : "暂无完整档案";
}

function summarizeLogItem(item = {}) {
  const type = String(item.AI_LOG_TYPE || "");
  const date = String(item.AI_LOG_DATE || "");
  const data = item.AI_LOG_DATA || {};
  if (type === "diet") {
    const items = Array.isArray(data.items) ? data.items.slice(0, 3).map(food => food && food.name).filter(Boolean) : [];
    const calories = data.calories || data.totalCalories || "";
    return `${date} 饮食: ${items.join("、") || "未命名"}${calories ? `, ${calories}kcal` : ""}`;
  }
  if (type === "exercise") {
    const exercises = Array.isArray(data.exercises) ? data.exercises.slice(0, 3).map(ex => ex && ex.name).filter(Boolean) : [];
    return `${date} 训练: ${exercises.join("、") || data.name || "已记录"}`;
  }
  if (type === "body") {
    const fields = [];
    if (data.weight) fields.push(`体重${data.weight}kg`);
    if (data.bodyFatRate) fields.push(`体脂${data.bodyFatRate}`);
    if (data.bmi) fields.push(`BMI${data.bmi}`);
    return `${date} 身体: ${fields.join("、") || "已记录"}`;
  }
  return "";
}

function summarizeRecentLogs(recentLogs = []) {
  return (Array.isArray(recentLogs) ? recentLogs : [])
    .map(summarizeLogItem)
    .filter(Boolean)
    .slice(0, 6);
}

function findPendingProposal(history = []) {
  const list = Array.isArray(history) ? history.slice().reverse() : [];
  for (const item of list) {
    const proposals = item && item.AI_MESSAGE_PAYLOAD && Array.isArray(item.AI_MESSAGE_PAYLOAD.proposals)
      ? item.AI_MESSAGE_PAYLOAD.proposals
      : [];
    const pending = proposals.find(proposal => proposal && proposal.status === "pending");
    if (pending) return pending;
  }
  return null;
}

function summarizePendingProposal(history = []) {
  const pending = findPendingProposal(history);
  if (!pending) return "无待确认 proposal";
  return `${pending.type}: ${String(pending.summary || pending.id || "待确认").slice(0, 80)}`;
}

function isWeightManagementIntent(message = "", intent = {}) {
  const route = `${intent.intent || ""} ${intent.responseMode || ""}`;
  return /(减脂|减肥|体重|热量|卡路里|饮食|晚餐|午餐|早餐|外卖|菜谱|训练|运动|BMI|基础代谢|代谢|体脂)/.test(String(message || ""))
    || /(meal_plan|diet|workout|body_status|calorie_gap|body_data)/.test(route);
}

function nextOnboardingField(profile = {}) {
  return ONBOARDING_FIELDS.find(field => !profile[field.key]);
}

function buildClarificationHint(input = {}) {
  const message = String(input.message || "");
  const intent = input.intent || {};
  const profile = input.profile || {};
  const routeName = String(intent.intent || "");

  if (routeName === "body_status_evaluation") {
    if (!profile.height) return "缺少身高时，只追问一次：你的身高是多少厘米？";
    if (!profile.weight && !(intent.entities && intent.entities.weight)) {
      return "缺少当前体重时，只追问一次：你现在体重大约多少公斤？";
    }
  }

  if (routeName === "meal_plan_generation" || routeName === "calorie_gap_evaluation") {
    if (!profile.weight) return "需要估算热量目标时，优先追问当前体重。";
    if (!profile.targetWeight && !profile.goal) return "如果用户要减脂方案但没有目标，优先追问目标体重或目标方向。";
  }

  if (routeName === "ask_clarification") {
    return "当前路由要求你只问一个最关键的澄清问题，不要给多选题，不要连问。";
  }

  if (isWeightManagementIntent(message, intent)) {
    const field = nextOnboardingField(profile);
    if (field) {
      return `当用户在做体重管理而档案未建完时，优先补全「${field.label}」。若本轮需要追问，就只问：${field.question}`;
    }
  }

  return "仅在完成当前任务必须补信息时才追问，而且一次只问一个问题。";
}

function buildContextSummary(input = {}) {
  const profileSummary = summarizeProfile(input.profile || {});
  const logSummary = summarizeRecentLogs(input.recentLogs || []);
  const observations = normalizeObservation(input.memory || []);
  const pendingProposalSummary = summarizePendingProposal(input.history || []);
  return [
    `[SESSION_CONTEXT]`,
    `用户档案: ${profileSummary}`,
    `最近记录: ${logSummary.length ? logSummary.join(" | ") : "暂无"}`,
    `长期观察: ${observations.length ? observations.join(" | ") : "暂无"}`,
    `待确认事项: ${pendingProposalSummary}`
  ].join("\n");
}

function buildSkillContext() {
  return [
    `[WEIGHT_LOSS_SKILL]`,
    `建档顺序: ${ONBOARDING_FIELDS.map(item => item.label).join(" -> ")}`,
    `活动系数: ${JSON.stringify(ACTIVITY_FACTORS)}`,
    `热量参考: ${SKILL_KNOWLEDGE.calorieReference.join(" ")}`,
    `运动参考: ${SKILL_KNOWLEDGE.exerciseReference.join(" ")}`,
    `饮食推荐: ${SKILL_KNOWLEDGE.recipeReference.join(" ")}`,
    `安全底线: ${SKILL_KNOWLEDGE.safetyReference.join(" ")}`
  ].join("\n");
}

module.exports = {
  ACTIVITY_FACTORS,
  ONBOARDING_FIELDS,
  SKILL_KNOWLEDGE,
  buildClarificationHint,
  buildContextSummary,
  buildSkillContext,
  findPendingProposal,
  summarizePendingProposal,
  summarizeProfile,
  summarizeRecentLogs
};
