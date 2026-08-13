function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDate(value) {
  return new Date(`${value}T12:00:00`);
}

const userStorage = require("../../../biz/user_storage.js");
const nutritionHelper = require("../../../../../helper/nutrition_helper.js");

Page({
  data: {
    statusBarHeight: 44,
    mode: "diet",
    selectedDate: "",
    year: 0,
    month: 0,
    title: "",
    weekdays: ["一", "二", "三", "四", "五", "六", "日"],
    days: [],
    dietSummary: null,
    trainingSummary: [],
    workoutStats: null
  },

  onLoad(options) {
    const info = wx.getSystemInfoSync();
    const selectedDate = options.date || formatDate(new Date());
    const selected = parseDate(selectedDate);
    this.setData({
      statusBarHeight: info.statusBarHeight || 44,
      mode: options.mode || "diet",
      selectedDate,
      year: selected.getFullYear(),
      month: selected.getMonth() + 1
    });
    this._buildMonth();
    this._loadSelectedSummary();
  },

  goBack() {
    wx.navigateBack();
  },

  changeMonth(e) {
    const delta = Number(e.currentTarget.dataset.delta);
    const date = new Date(this.data.year, this.data.month - 1 + delta, 1);
    this.setData({ year: date.getFullYear(), month: date.getMonth() + 1 });
    this._buildMonth();
  },

  selectDay(e) {
    const selectedDate = e.currentTarget.dataset.date;
    if (!selectedDate) return;
    const selected = parseDate(selectedDate);
    this.setData({
      selectedDate,
      year: selected.getFullYear(),
      month: selected.getMonth() + 1
    });
    this._buildMonth();
    this._loadSelectedSummary();
  },

  confirmDate() {
    wx.setStorageSync("fitness_calendar_result", {
      mode: this.data.mode,
      date: this.data.selectedDate
    });
    wx.navigateBack();
  },

  backToday() {
    const today = new Date();
    const selectedDate = formatDate(today);
    this.setData({
      selectedDate,
      year: today.getFullYear(),
      month: today.getMonth() + 1
    });
    this._buildMonth();
    this._loadSelectedSummary();
  },

  _buildMonth() {
    const first = new Date(this.data.year, this.data.month - 1, 1);
    const firstWeekday = first.getDay() === 0 ? 7 : first.getDay();
    const daysInMonth = new Date(this.data.year, this.data.month, 0).getDate();
    const previousDays = new Date(this.data.year, this.data.month - 1, 0).getDate();
    const todayKey = formatDate(new Date());
    const days = [];
    const records = this.data.mode === "diet"
      ? userStorage.get("fitness_diet_records", {})
      : userStorage.get("fitness_training_plan", {});

    for (let index = 0; index < 42; index += 1) {
      const dayNumber = index - firstWeekday + 2;
      let date = null;
      let currentMonth = true;
      if (dayNumber < 1) {
        date = new Date(this.data.year, this.data.month - 2, previousDays + dayNumber);
        currentMonth = false;
      } else if (dayNumber > daysInMonth) {
        date = new Date(this.data.year, this.data.month - 1, dayNumber);
        currentMonth = false;
      } else {
        date = new Date(this.data.year, this.data.month - 1, dayNumber);
      }
      const key = formatDate(date);
      days.push({
        key,
        day: date.getDate(),
        currentMonth,
        selected: key === this.data.selectedDate,
        today: key === todayKey,
        hasRecord: Array.isArray(records[key])
          ? records[key].length > 0
          : Boolean(records[key] && ["breakfast", "lunch", "dinner", "snack"]
            .some(meal => Array.isArray(records[key][meal]) && records[key][meal].length))
      });
    }

    this.setData({
      title: `${this.data.year}年${this.data.month}月`,
      days
    });
  },

  _loadSelectedSummary() {
    if (this.data.mode === "training") {
      const plans = userStorage.get("fitness_training_plan", {});
      const allStats = userStorage.get("fitness_workout_stats", {});
      const trainingSummary = (plans[this.data.selectedDate] || []).map(item => ({
        name: item.name,
        setCount: Array.isArray(item.sets) ? item.sets.length : 0,
        completedSets: Array.isArray(item.sets)
          ? item.sets.filter(set => set.completed || set.done).length
          : 0
      }));
      this.setData({
        trainingSummary,
        workoutStats: allStats[this.data.selectedDate] || null,
        dietSummary: null
      });
      return;
    }
    const records = userStorage.get("fitness_diet_records", {});
    const record = records[this.data.selectedDate] || {};
    const names = { breakfast: "早餐", lunch: "午餐", dinner: "晚餐", snack: "加餐" };
    const meals = Object.keys(names).map(key => ({
      key,
      name: names[key],
      items: (record[key] || []).map(nutritionHelper.normalizeNutritionItem)
    })).filter(meal => meal.items.length);
    const allItems = meals.reduce((items, meal) => items.concat(meal.items), []);
    this.setData({
      trainingSummary: [],
      workoutStats: null,
      dietSummary: Object.assign(nutritionHelper.summarizeNutrition(allItems), { meals })
    });
  }
});
