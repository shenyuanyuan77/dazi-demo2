const userStorage = require("../../../biz/user_storage.js");
const nutritionHelper = require("../../../../../helper/nutrition_helper.js");
const dietAnalysisService = require("../../../biz/diet_analysis_service.js");
const fitnessStore = require("../../../store/fitness_store.js");
const goalConfig = require("../../../config/goal_config.js");
const safeTop = require("../../../../../helper/safe_top.js");
const STORAGE_KEY = "fitness_diet_records";
const DEFAULT_GOAL = 1800;

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLabel(date) {
  const today = formatDate(new Date());
  const dateKey = formatDate(date);
  const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  return {
    primary: dateKey === today ? "今天" : `${date.getMonth() + 1}月${date.getDate()}日`,
    secondary: weekdays[date.getDay()]
  };
}

// 以 selectedDate 为锚, 生成本周 (周一~周日) 的日期条
function buildWeekDays(selectedDateStr) {
  const anchor = selectedDateStr ? new Date(`${selectedDateStr}T12:00:00`) : new Date();
  const day = anchor.getDay(); // 0=周日
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() + mondayOffset);
  const names = ["一", "二", "三", "四", "五", "六", "日"];
  const selectedKey = formatDate(anchor);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key = formatDate(d);
    out.push({
      date: key,
      weekName: names[i],
      dayNum: d.getDate(),
      selected: key === selectedKey
    });
  }
  return out;
}

Page({
  data: {
    statusBarHeight: 44,
    safeTop: 88,
    selectedDate: "",
    dateLabel: "今天",
    weekdayLabel: "",
    totalCalories: 0,
    goalCalories: DEFAULT_GOAL,
    progress: 0,
    dailyMetrics: [],
    dailySummary: {},
    userGoal: goalConfig.GOAL_TYPES.BODY_SHAPING,
    goalFocus: "",
    editingMeal: "",
    foodName: "",
    foodCalories: "",
    swipeMeal: "",
    swipeId: "",
    weekDays: [],
    macroSummary: { protein: 0, carbs: 0, fat: 0 },
    macroTargets: { protein: 120, carbs: 220, fat: 60 },
    remainingCalories: DEFAULT_GOAL,
    meals: [
      { key: "breakfast", name: "早餐", items: [], calories: 0, expanded: true },
      { key: "lunch", name: "午餐", items: [], calories: 0, expanded: false },
      { key: "dinner", name: "晚餐", items: [], calories: 0, expanded: false },
      { key: "snack", name: "加餐", items: [], calories: 0, expanded: false }
    ]
  },

  onLoad() {
    const date = new Date();
    const label = getLabel(date);
    const dateKey = formatDate(date);
    this.setData(Object.assign(safeTop.injectInto({}), {
      selectedDate: dateKey,
      dateLabel: label.primary,
      weekdayLabel: label.secondary,
      weekDays: buildWeekDays(dateKey)
    }));
    this._loadRecords();
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.setData({ current: 1 });
    const settings = wx.getStorageSync("fitness_app_settings") || {};
    const profile = fitnessStore.getUserProfile();
    const config = goalConfig.getGoalConfig(profile.goal);
    const legacyManualTarget = settings.calorieGoalManual === undefined &&
      Number(settings.calorieGoal) > 0 &&
      Number(settings.calorieGoal) !== DEFAULT_GOAL;
    this.setData({
      goalCalories: (settings.calorieGoalManual || legacyManualTarget)
        ? Number(settings.calorieGoal)
        : (profile.calorieTarget || DEFAULT_GOAL),
      userGoal: profile.goal,
      goalFocus: `${config.name} · ${config.dietFocus}`,
      swipeMeal: "",
      swipeId: ""
    });
    const result = wx.getStorageSync("fitness_calendar_result");
    if (result && result.mode === "diet" && result.date) {
      wx.removeStorageSync("fitness_calendar_result");
      const date = new Date(`${result.date}T12:00:00`);
      const label = getLabel(date);
      this.setData({
        selectedDate: result.date,
        dateLabel: label.primary,
        weekdayLabel: label.secondary
      });
    }
    if (this.data.selectedDate) this._loadRecords();
  },

  openCalendar() {
    wx.navigateTo({
      url: `../../common/calendar/date_calendar?mode=diet&date=${this.data.selectedDate}`
    });
  },

  // [v2] 周日期条点击切换
  selectWeekDay(e) {
    const dateKey = e.currentTarget.dataset.date;
    if (!dateKey || dateKey === this.data.selectedDate) return;
    const date = new Date(`${dateKey}T12:00:00`);
    const label = getLabel(date);
    this.setData({
      selectedDate: dateKey,
      dateLabel: label.primary,
      weekdayLabel: label.secondary,
      weekDays: buildWeekDays(dateKey),
      swipeMeal: "",
      swipeId: ""
    });
    this._loadRecords();
  },

  // [v2] 饮食分析入口 -> AI 教练页带预设问题
  goDietAnalysis() {
    wx.switchTab({ url: "/projects/dazi/pages/ai/chat/ai_chat" });
    wx.setStorageSync("fitness_ai_preset_question", "帮我分析今天的饮食结构");
  },

  openFoodEditor(e) {
    wx.navigateTo({
      url: `../food/food_editor?date=${this.data.selectedDate}&meal=${e.currentTarget.dataset.meal}`
    });
  },

  closeFoodEditor() {
    this.setData({ editingMeal: "", foodName: "", foodCalories: "" });
  },

  onFoodName(e) {
    this.setData({ foodName: e.detail.value });
  },

  onFoodCalories(e) {
    this.setData({ foodCalories: e.detail.value.replace(/[^\d]/g, "") });
  },

  addFood() {
    const name = this.data.foodName.trim();
    const calories = Number(this.data.foodCalories);
    if (!name || !calories) {
      wx.showToast({ title: "请输入有效的食物名称和热量", icon: "none" });
      return;
    }

    const meals = this.data.meals.map(meal => {
      if (meal.key !== this.data.editingMeal) return meal;
      const items = meal.items.concat({ id: Date.now(), name, calories });
      return Object.assign({}, meal, {
        items,
        calories: nutritionHelper.summarizeNutrition(items).calories
      });
    });
    this.setData({ meals, editingMeal: "", foodName: "", foodCalories: "" });
    this._recalculate();
    this._saveRecords();
  },

  removeFood(e) {
    const { meal, id } = e.currentTarget.dataset;
    const meals = this.data.meals.map(item => {
      if (item.key !== meal) return item;
      const items = item.items.filter(food => String(food.id) !== String(id));
      return Object.assign({}, item, {
        items,
        calories: nutritionHelper.summarizeNutrition(items).calories
      });
    });
    this.setData({ meals, swipeMeal: "", swipeId: "" });
    this._recalculate();
    this._saveRecords();
  },

  onSwipeStart(e) {
    const touch = e.touches && e.touches[0];
    this._swipeStartX = touch ? touch.clientX : 0;
  },

  onFoodSwipeEnd(e) {
    const touch = e.changedTouches && e.changedTouches[0];
    const delta = (touch ? touch.clientX : 0) - (this._swipeStartX || 0);
    if (delta < -35) {
      this.setData({
        swipeMeal: e.currentTarget.dataset.meal,
        swipeId: e.currentTarget.dataset.id
      });
    } else if (delta > 25) {
      this.setData({ swipeMeal: "", swipeId: "" });
    }
  },

  closeSwipe() {
    if (this.data.swipeMeal || this.data.swipeId) {
      this.setData({ swipeMeal: "", swipeId: "" });
    }
  },

  noop() {},

  toggleMeal(e) {
    const meal = e.currentTarget.dataset.meal;
    const meals = this.data.meals.map(item => (
      item.key === meal ? Object.assign({}, item, { expanded: !item.expanded }) : item
    ));
    this.setData({ meals });
  },

  _recalculate() {
    const settings = Object.assign({}, wx.getStorageSync("fitness_app_settings") || {}, {
      calorieGoal: this.data.goalCalories
    });
    const analysis = dietAnalysisService.analyzeDiet(
      this.data.meals,
      settings,
      this.data.userGoal
    );
    const total = analysis.summary.calories || 0;
    const goal = analysis.targets.calories || this.data.goalCalories;
    const remaining = Math.max(0, goal - total);
    // 三大营养素汇总
    const macroSummary = {
      protein: Math.round(analysis.summary.protein || 0),
      carbs: Math.round(analysis.summary.carbs || 0),
      fat: Math.round(analysis.summary.fat || 0)
    };
    // 按目标热量粗估三大营养素目标 (蛋白 20% / 碳水 55% / 脂肪 25%, 4-4-9 kcal/g)
    const macroTargets = {
      protein: Math.round(goal * 0.20 / 4),
      carbs: Math.round(goal * 0.55 / 4),
      fat: Math.round(goal * 0.25 / 9)
    };
    this.setData({
      meals: analysis.meals,
      totalCalories: analysis.summary.calories,
      dailySummary: analysis.summary,
      dailyMetrics: analysis.dailyMetrics,
      progress: Math.min(100, Math.round(total / goal * 100)),
      macroSummary,
      macroTargets,
      remainingCalories: remaining
    });
  },

  _loadRecords() {
    const records = userStorage.get(STORAGE_KEY, {});
    const saved = records[this.data.selectedDate] || {};
    const meals = this.data.meals.map(meal => {
      const items = saved[meal.key] || [];
      return Object.assign({}, meal, {
        items: items.map(nutritionHelper.normalizeNutritionItem),
        calories: nutritionHelper.summarizeNutrition(items).calories
      });
    });
    this.setData({ meals }, () => this._recalculate());
  },

  _saveRecords() {
    const records = userStorage.get(STORAGE_KEY, {});
    records[this.data.selectedDate] = {};
    this.data.meals.forEach(meal => {
      records[this.data.selectedDate][meal.key] = meal.items;
    });
    userStorage.set(STORAGE_KEY, records);
  }
});
