const SETTINGS_KEY = "fitness_app_settings";
const userStorage = require("../../../../biz/user_storage.js");
const fitnessStore = require("../../../../store/fitness_store.js");

Page({
  data: {
    statusBarHeight: 44,
    type: "",
    title: "设置",
    unit: "公制",
    calorieGoal: "1800",
    calorieGoalManual: false,
    calorieEditorVisible: false
  },

  onLoad(options) {
    const info = wx.getSystemInfoSync();
    const settings = wx.getStorageSync(SETTINGS_KEY) || {};
    const profile = fitnessStore.getUserProfile();
    const legacyManualTarget = settings.calorieGoalManual === undefined &&
      Number(settings.calorieGoal) > 0 &&
      Number(settings.calorieGoal) !== 1800;
    const manual = Boolean(settings.calorieGoalManual || legacyManualTarget);
    const titles = { unit: "单位设置", calorie: "每日热量目标", privacy: "隐私与数据" };
    this.setData({
      statusBarHeight: info.statusBarHeight || 44,
      type: options.type || "unit",
      title: titles[options.type] || "设置",
      unit: settings.unit || "公制",
      calorieGoal: String(manual ? settings.calorieGoal : profile.calorieTarget),
      calorieGoalManual: manual
    });
  },

  goBack() { wx.navigateBack(); },
  onCalorie(e) { this.setData({ calorieGoal: e.detail.value.replace(/[^\d]/g, "") }); },

  openCalorieEditor() {
    this.setData({ calorieEditorVisible: true });
  },

  closeCalorieEditor() {
    this.setData({ calorieEditorVisible: false });
  },

  confirmCalorieEditor(e) {
    this.setData({
      calorieGoal: String(e.detail.value).replace(/[^\d]/g, ""),
      calorieGoalManual: true,
      calorieEditorVisible: false
    });
  },

  useAutomaticCalories() {
    const settings = wx.getStorageSync(SETTINGS_KEY) || {};
    delete settings.calorieGoal;
    settings.calorieGoalManual = false;
    wx.setStorageSync(SETTINGS_KEY, settings);
    const profile = fitnessStore.getUserProfile();
    this.setData({
      calorieGoal: String(profile.calorieTarget),
      calorieGoalManual: false
    });
    wx.showToast({ title: "已恢复自动计算", icon: "none" });
  },

  selectUnit(e) {
    this.setData({ unit: e.currentTarget.dataset.unit });
  },

  save() {
    const settings = wx.getStorageSync(SETTINGS_KEY) || {};
    if (this.data.type === "unit") settings.unit = this.data.unit;
    if (this.data.type === "calorie") {
      settings.calorieGoal = Number(this.data.calorieGoal) || 1800;
      settings.calorieGoalManual = this.data.calorieGoalManual;
    }
    wx.setStorageSync(SETTINGS_KEY, settings);
    wx.showToast({ title: "设置已保存", icon: "success" });
    setTimeout(() => wx.navigateBack(), 350);
  },

  clearAllData() {
    wx.showModal({
      title: "删除全部健身数据",
      content: "此操作会删除饮食、训练和身体档案，且无法恢复。",
      confirmText: "删除",
      confirmColor: "#D64545",
      success: ({ confirm }) => {
        if (!confirm) return;
        ["fitness_diet_records", "fitness_training_plan", "fitness_profile"].forEach(key => userStorage.remove(key));
        wx.showToast({ title: "数据已删除", icon: "success" });
      }
    });
  }
});
