const userStorage = require("../../../biz/user_storage.js");
const STORAGE_KEY = "fitness_training_plan";

const PRESETS = [
  { name: "硬拉", subtitle: "Deadlift" },
  { name: "引体向上", subtitle: "Pull Up" },
  { name: "坐姿划船", subtitle: "Seated Row" },
  { name: "肩上推举", subtitle: "Shoulder Press" },
  { name: "箭步蹲", subtitle: "Lunge" },
  { name: "平板支撑", subtitle: "Plank" }
];

Page({
  data: {
    statusBarHeight: 44,
    date: "",
    presets: PRESETS,
    name: "",
    subtitle: "",
    setCount: 3,
    weight: "",
    reps: "10",
    keyboardHeight: 0
  },

  onLoad(options) {
    const info = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: info.statusBarHeight || 44,
      date: options.date || ""
    });
    this._keyboardHandler = ({ height }) => {
      this.setData({ keyboardHeight: Math.max(0, Number(height) || 0) });
    };
    wx.onKeyboardHeightChange(this._keyboardHandler);
  },

  onUnload() {
    if (this._keyboardHandler) wx.offKeyboardHeightChange(this._keyboardHandler);
  },

  goBack() {
    wx.navigateBack();
  },

  selectPreset(e) {
    this.setData({
      name: e.currentTarget.dataset.name,
      subtitle: e.currentTarget.dataset.subtitle
    });
  },

  onName(e) { this.setData({ name: e.detail.value }); },
  onSubtitle(e) { this.setData({ subtitle: e.detail.value }); },
  onWeight(e) { this.setData({ weight: e.detail.value.replace(/[^\d.]/g, "") }); },
  onReps(e) { this.setData({ reps: e.detail.value.replace(/[^\d]/g, "") }); },

  onKeyboardHeightChange(e) {
    this.setData({ keyboardHeight: Math.max(0, Number(e.detail && e.detail.height) || 0) });
  },

  changeSetCount(e) {
    const delta = Number(e.currentTarget.dataset.delta);
    this.setData({ setCount: Math.min(10, Math.max(1, this.data.setCount + delta)) });
  },

  saveExercise() {
    const name = this.data.name.trim();
    if (!name) {
      wx.showToast({ title: "请填写动作名称", icon: "none" });
      return;
    }
    const plans = userStorage.get(STORAGE_KEY, {});
    const exercises = plans[this.data.date] || [];
    const now = Date.now();
    exercises.push({
      id: now,
      name,
      subtitle: this.data.subtitle.trim() || "自定义动作",
      expanded: true,
      sets: Array.from({ length: this.data.setCount }, (_, index) => ({
        id: now + index + 1,
        weight: this.data.weight,
        reps: this.data.reps,
        completed: false,
        done: false
      }))
    });
    plans[this.data.date] = exercises;
    userStorage.set(STORAGE_KEY, plans);
    wx.hideKeyboard();
    wx.showToast({ title: "动作已添加", icon: "success" });
    setTimeout(() => wx.navigateBack(), 350);
  }
});
