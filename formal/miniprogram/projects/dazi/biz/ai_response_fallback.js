const nutritionHelper = require("../../../helper/nutrition_helper.js");
const goalConfig = require("../config/goal_config.js");
const foodRecognitionService = require("./food_recognition_service.js");
const bodyMetricsService = require("./body_metrics_service.js");
const proposalPolicy = require("./ai_proposal_policy.js");

const FOODS = {
  "米饭": { amount: 150, carbs: 25.9, protein: 2.6, fat: 0.3 },
  "白米饭": { amount: 150, carbs: 25.9, protein: 2.6, fat: 0.3 },
  "鸡胸肉": { amount: 120, carbs: 0, protein: 31, fat: 3.6 },
  "鸡蛋": { amount: 50, carbs: 1.1, protein: 12.6, fat: 10.6 },
  "牛奶": { amount: 250, carbs: 4.8, protein: 3.2, fat: 3.6 },
  "面包": { amount: 60, carbs: 49, protein: 9, fat: 3.2 },
  "燕麦": { amount: 50, carbs: 66, protein: 15, fat: 7 },
  "香蕉": { amount: 100, carbs: 22.8, protein: 1.1, fat: 0.3 },
  "酸奶": { amount: 200, carbs: 12, protein: 3.5, fat: 3.2 },
  "西兰花": { amount: 100, carbs: 6.6, protein: 2.8, fat: 0.4 },
  "烤鸭": { amount: 150, carbs: 3, protein: 19, fat: 28 },
  "叉烧": { amount: 100, carbs: 10, protein: 23, fat: 18 },
  "豆角": { amount: 100, carbs: 7, protein: 2.5, fat: 0.3 },
  "青菜": { amount: 100, carbs: 3.5, protein: 1.8, fat: 0.3 },
  "辣椒酱": { amount: 15, carbs: 12, protein: 2, fat: 3 }
};

function noWrite(message) {
  return proposalPolicy.explicitNoWrite(message);
}

function detectIntent(message, hasImages, routedIntent) {
  if (routedIntent && routedIntent.responseMode && routedIntent.responseMode !== "generate_proposal") {
    return "";
  }
  const routed = String(routedIntent && routedIntent.intent || "");
  if (routed === "body_data_recognition") return "profile_patch";
  if (["food_log_write", "diet_record_update", "diet_record_delete"].includes(routed)) return "food_log";
  if (["workout_plan_generation", "workout_log_record", "workout_plan_update", "workout_plan_delete"].includes(routed)) {
    return "workout_plan";
  }
  const text = String(message || "");
  if (noWrite(text)) return "";
  if (/(训练计划|安排.{0,4}训练|今天.{0,3}(练|做训练)|练什么|居家.{0,4}训练|哑铃训练|加入.{0,4}训练|背部训练|胸部训练|腿部训练)/.test(text)) {
    return "workout_plan";
  }
  if (
    hasImages ||
    /(我.{0,8}(吃了|喝了)|早餐|午餐|晚餐|加餐|这一顿饭|食物|饮食记录|高蛋白饮食|识别.{0,4}(餐|图)|多少热量)/.test(text)
  ) {
    return "food_log";
  }
  if (/(体重|体脂|bmi|基础代谢|内脏脂肪|腰围|臀围|胸围|身体数据)/i.test(text)) {
    return "profile_patch";
  }
  return "";
}

function mealType(text) {
  if (/早餐|早饭/.test(text)) return "breakfast";
  if (/午餐|午饭/.test(text)) return "lunch";
  if (/晚餐|晚饭/.test(text)) return "dinner";
  if (/加餐|夜宵/.test(text)) return "snack";
  return "";
}

function extractFoods(content, message) {
  const text = `${content || ""}\n${message || ""}`;
  const seen = new Set();
  const result = [];
  Object.keys(FOODS)
    .sort((left, right) => right.length - left.length)
    .forEach(name => {
      if (!text.includes(name) || seen.has(name)) return;
      const canonicalName = name === "米饭" && text.includes("白米饭") ? "白米饭" : name;
      if (seen.has(canonicalName)) return;
      seen.add(canonicalName);
      const around = text.slice(Math.max(0, text.indexOf(name)), text.indexOf(name) + 30);
      const amountMatch = around.match(/(\d+(?:\.\d+)?)\s*(g|克|ml|毫升|份|块|个)/i);
      result.push({
        name: canonicalName,
        amount: amountMatch ? Number(amountMatch[1]) : FOODS[canonicalName].amount,
        unit: amountMatch && amountMatch[2] || "g"
      });
    });
  return result.slice(0, 8).map(food => {
    const config = FOODS[food.name];
    const factor = food.amount / 100;
    const carbs = Math.round(config.carbs * factor * 10) / 10;
    const protein = Math.round(config.protein * factor * 10) / 10;
    const fat = Math.round(config.fat * factor * 10) / 10;
    return Object.assign({}, food, {
      calories: nutritionHelper.calculateCaloriesByMacros(carbs, protein, fat),
      carbs,
      protein,
      fat,
      confidence: 0.78
    });
  });
}

function setList(name, count, reps, restSeconds, muscleGroups, instruction) {
  return {
    name,
    muscleGroups,
    instruction,
    sets: Array.from({ length: count }, (_, index) => ({
      setIndex: index + 1,
      weight: "",
      reps: String(reps),
      restSeconds,
      completed: false
    }))
  };
}

function workoutExercises(goal, message) {
  const config = goalConfig.getGoalConfig(goal);
  const rest = config.defaultRestSeconds;
  if (/腿|下肢/.test(message)) {
    return [
      setList("杯式深蹲", 4, goal === "muscle_gain" ? 10 : 15, rest, ["股四头肌", "臀大肌"], "膝盖与脚尖同向"),
      setList("哑铃罗马尼亚硬拉", 4, 10, rest, ["腘绳肌", "臀大肌"], "髋部向后，背部中立"),
      setList("保加利亚分腿蹲", 3, 10, rest, ["股四头肌", "臀大肌"], "前脚全脚掌稳定"),
      setList("臀桥", 4, 15, rest, ["臀大肌", "核心"], "顶端收紧臀部"),
      setList("站姿提踵", 3, 18, rest, ["小腿"], "顶端停顿一秒")
    ];
  }
  if (/背/.test(message)) {
    return [
      setList("哑铃俯身划船", 4, 10, rest, ["背部"], "背部收紧，避免耸肩"),
      setList("单臂哑铃划船", 3, 12, rest, ["背阔肌"], "保持身体稳定"),
      setList("哑铃罗马尼亚硬拉", 4, 10, rest, ["后链"], "髋部向后"),
      setList("俯卧反向飞鸟", 3, 15, rest, ["上背"], "小重量控制"),
      setList("平板支撑", 3, 40, rest, ["核心"], "保持身体一条直线")
    ];
  }
  if (/胸/.test(message)) {
    return [
      setList("哑铃卧推", 4, 10, rest, ["胸部", "肱三头肌"], "肩胛稳定，下放受控"),
      setList("上斜哑铃卧推", 3, 10, rest, ["上胸"], "避免耸肩"),
      setList("哑铃飞鸟", 3, 12, rest, ["胸部"], "肘部微屈"),
      setList("俯卧撑", 3, 12, rest, ["胸部", "核心"], "身体保持直线"),
      setList("窄距俯卧撑", 3, 10, rest, ["肱三头肌"], "肘部贴近身体")
    ];
  }
  if (config.goalType === goalConfig.GOAL_TYPES.FAT_LOSS) {
    return [
      setList("开合跳", 3, 40, rest, ["全身"], "轻落地"),
      setList("徒手深蹲", 4, 15, rest, ["臀腿"], "膝盖与脚尖同向"),
      setList("俯卧撑", 3, 10, rest, ["胸部", "核心"], "核心收紧"),
      setList("登山跑", 4, 30, rest, ["核心"], "保持髋部稳定"),
      setList("波比跳", 3, 8, rest, ["全身"], "按体能调整速度")
    ];
  }
  if (config.goalType === goalConfig.GOAL_TYPES.MUSCLE_GAIN) {
    return [
      setList("哑铃卧推", 4, 10, rest, ["胸部"], "下放受控"),
      setList("单臂哑铃划船", 4, 10, rest, ["背部"], "顶端夹背"),
      setList("杯式深蹲", 4, 10, rest, ["臀腿"], "保持身体稳定"),
      setList("哑铃肩推", 3, 10, rest, ["肩部"], "避免腰部过伸"),
      setList("哑铃罗马尼亚硬拉", 4, 10, rest, ["后链"], "感受后侧拉伸")
    ];
  }
  return [
    setList("杯式深蹲", 3, 15, rest, ["臀腿"], "保持膝髋稳定"),
    setList("死虫", 3, 12, rest, ["核心"], "腰背贴地"),
    setList("臀桥", 4, 15, rest, ["臀部"], "顶端夹紧臀部"),
    setList("跪姿俯卧撑", 3, 12, rest, ["胸部"], "身体保持直线"),
    setList("侧平板支撑", 3, 30, rest, ["核心"], "避免塌腰")
  ];
}

function ensureAssistant(answer, message, context, hasImages, metadata) {
  const source = answer || {};
  const routedIntent = metadata && metadata.intentResult;
  const payload = Object.assign({}, source.payload || {});
  const gatedSource = proposalPolicy.applyProposalMode(source, routedIntent);
  const gatedPayload = Object.assign({}, gatedSource.payload || payload);
  const existing = Array.isArray(gatedPayload.proposals) ? gatedPayload.proposals : [];
  const hasUsableProposal = proposalPolicy.hasUsableProposal(existing);

  if (noWrite(message)) return gatedSource;

  const bodyMetrics = bodyMetricsService.parseBodyMetricsText(
    `${message || ""}\n${gatedSource.content || ""}`
  );
  if (
    Object.keys(bodyMetrics).length &&
    (!routedIntent || routedIntent.intent === "body_data_recognition")
  ) {
    return Object.assign({}, gatedSource, {
      type: "profile",
      content: "我识别到你提供的是身体数据，已整理成下方待确认卡片，请先核对后再写入。",
      payload: Object.assign({}, gatedPayload, {
        proposals: [{
          id: `body-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: "profilePatch",
          status: "pending",
          summary: `识别到 ${Object.keys(bodyMetrics).length} 项身体指标`,
          payload: {
            profilePatch: bodyMetrics,
            sourceMessageId: metadata && metadata.sourceMessageId || ""
          }
        }]
      })
    });
  }

  const reconciledFood = foodRecognitionService.reconcileAssistant(source, message, {
    hasImages,
    sourceMessageId: metadata && metadata.sourceMessageId,
    recognition: metadata && metadata.recognition
  });
  if (reconciledFood) return reconciledFood;

  if (routedIntent && routedIntent.responseMode && routedIntent.responseMode !== "generate_proposal") {
    return gatedSource;
  }
  if (hasUsableProposal) return gatedSource;

  const intent = detectIntent(`${message || ""}\n${gatedSource.content || ""}`, hasImages, routedIntent);
  if (!intent) return gatedSource;

  if (intent === "food_log") {
    let items = extractFoods(gatedSource.content, message);
    if (!items.length && hasImages && nutritionHelper.hasMacroData(gatedPayload)) {
      items = [{
        name: "图片餐食（请编辑名称）",
        amount: 1,
        unit: "份",
        calories: nutritionHelper.calculateFoodCalories(gatedPayload),
        carbs: Math.max(0, Number(gatedPayload.carbs) || 0),
        protein: Math.max(0, Number(gatedPayload.protein) || 0),
        fat: Math.max(0, Number(gatedPayload.fat) || 0),
        confidence: 0.6
      }];
    }
    if (!items.length) return gatedSource;
    const totals = nutritionHelper.summarizeNutrition(items);
    return Object.assign({}, gatedSource, {
      type: "diet",
      content: `${gatedSource.content}\n\n已整理为饮食草稿，请在下方选择餐次并确认是否写入。`,
      payload: Object.assign({}, gatedPayload, totals, {
        proposals: [{
          id: `local-food-${Date.now()}`,
          type: "dietLog",
          status: "pending",
          summary: `识别到 ${items.map(item => item.name).join("、")}`,
          payload: {
            date: "",
            meal: mealType(`${message} ${source.content}`),
            items
          }
        }]
      })
    });
  }

  if (intent !== "workout_plan") return gatedSource;

  const profile = context && context.userProfile || {};
  const goal = goalConfig.normalizeGoal(profile.goal);
  const config = goalConfig.getGoalConfig(goal);
  const durationMatch = String(message || "").match(/(\d+)\s*分钟/);
  const duration = durationMatch ? Number(durationMatch[1]) : 30;
  const exercises = workoutExercises(goal, message);
  const calories = Math.round(
    (goal === "fat_loss" ? 7 : (goal === "muscle_gain" ? 5.5 : 4.5)) *
    (Number(profile.weight) || 65) *
    duration / 60
  );
  return Object.assign({}, gatedSource, {
    type: "training",
    content: [
      `已按你的${config.name}目标生成 ${duration} 分钟训练：`,
      ...exercises.map((item, index) => (
        `${index + 1}. ${item.name}：${item.sets.length} 组 × ${item.sets[0].reps}，休息 ${item.sets[0].restSeconds} 秒`
      )),
      `预计消耗约 ${calories} kcal。请在下方确认是否写入训练计划。`
    ].join("\n"),
    payload: Object.assign({}, gatedPayload, {
      proposals: [{
        id: `local-workout-${Date.now()}`,
        type: "workoutPlan",
        status: "pending",
        summary: `${config.name} · ${duration} 分钟 · 约 ${calories} kcal`,
        payload: {
          date: "",
          planName: `${config.name}训练计划`,
          goal,
          estimatedDurationMinutes: duration,
          estimatedCaloriesBurned: calories,
          targetMuscleGroups: Array.from(new Set(exercises.reduce(
            (list, item) => list.concat(item.muscleGroups || []),
            []
          ))),
          exercises
        }
      }]
    })
  });
}

module.exports = {
  detectIntent,
  extractFoods,
  workoutExercises,
  ensureAssistant
};
