const DEFAULT_EXERCISE = {
  key: "strength_generic",
  name: "力量训练",
  met: 5,
  type: "力量训练",
  muscles: ["全身"],
  secondsPerRep: 4
};

const EXERCISES = [
  {
    key: "barbell_squat",
    name: "杠铃深蹲",
    aliases: ["Barbell Back Squat", "深蹲"],
    met: 6,
    type: "力量训练",
    muscles: ["股四头肌", "臀大肌", "核心"],
    secondsPerRep: 4
  },
  {
    key: "dumbbell_bench_press",
    name: "哑铃卧推",
    aliases: ["Dumbbell Bench Press", "哑铃推胸"],
    met: 5.5,
    type: "力量训练",
    muscles: ["胸部", "肱三头肌", "肩部"],
    secondsPerRep: 4
  },
  {
    key: "seated_row",
    name: "坐姿划船",
    aliases: ["Seated Row", "划船"],
    met: 5.5,
    type: "力量训练",
    muscles: ["背部", "肱二头肌"],
    secondsPerRep: 4
  },
  {
    key: "lat_pulldown",
    name: "高位下拉",
    aliases: ["Lat Pulldown"],
    met: 5,
    type: "力量训练",
    muscles: ["背部", "肱二头肌"],
    secondsPerRep: 4
  },
  {
    key: "plank",
    name: "平板支撑",
    aliases: ["Plank"],
    met: 3.8,
    type: "核心训练",
    muscles: ["核心"],
    secondsPerRep: 3
  },
  {
    key: "burpee",
    name: "波比跳",
    aliases: ["Burpee", "Burpees"],
    met: 8,
    type: "高强度间歇训练",
    muscles: ["全身", "核心"],
    secondsPerRep: 3
  },
  {
    key: "deadlift",
    name: "硬拉",
    aliases: ["Deadlift"],
    met: 6,
    type: "力量训练",
    muscles: ["臀大肌", "腘绳肌", "背部"],
    secondsPerRep: 5
  },
  {
    key: "push_up",
    name: "俯卧撑",
    aliases: ["Push Up", "Push-up"],
    met: 4,
    type: "自重训练",
    muscles: ["胸部", "肱三头肌", "核心"],
    secondsPerRep: 3
  }
];

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function getExerciseConfig(value) {
  const name = normalizeName(value);
  const found = EXERCISES.find(item => (
    normalizeName(item.name) === name ||
    (item.aliases || []).some(alias => normalizeName(alias) === name) ||
    name.includes(normalizeName(item.name))
  ));
  return Object.assign({}, DEFAULT_EXERCISE, found || {}, {
    muscles: (found && found.muscles ? found.muscles : DEFAULT_EXERCISE.muscles).slice()
  });
}

module.exports = {
  DEFAULT_EXERCISE,
  EXERCISES,
  getExerciseConfig
};
