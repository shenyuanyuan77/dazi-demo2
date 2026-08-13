const cloudHelper = require("../../../../../helper/cloud_helper.js");
const fitnessStore = require("../../../store/fitness_store.js");
const SETTINGS_KEY = "fitness_app_settings";
const COACH_KEY = "fitness_ai_coach_profile";
const DEFAULT_SETTINGS = {
  notifications: true,
  vibration: true,
  unit: "公制",
  calorieGoal: 1800
};
const DEFAULT_COACH = {
  name: "AI 教练",
  avatar: "",
  initials: "AI"
};

Page({
  data: {
    statusBarHeight: 44,
    settings: DEFAULT_SETTINGS,
    coach: DEFAULT_COACH
  },

  onLoad() {
    const info = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: info.statusBarHeight || 44 });
    this._load();
  },

  onShow() {
    this._load();
  },

  _load() {
    const coach = Object.assign({}, DEFAULT_COACH, wx.getStorageSync(COACH_KEY) || {});
    const storedSettings = wx.getStorageSync(SETTINGS_KEY) || {};
    const profile = fitnessStore.getUserProfile();
    const legacyManualTarget = storedSettings.calorieGoalManual === undefined &&
      Number(storedSettings.calorieGoal) > 0 &&
      Number(storedSettings.calorieGoal) !== DEFAULT_SETTINGS.calorieGoal;
    const manual = Boolean(storedSettings.calorieGoalManual || legacyManualTarget);
    coach.initials = this._getInitials(coach.name);
    this.setData({
      settings: Object.assign({}, DEFAULT_SETTINGS, storedSettings, {
        calorieGoal: manual ? Number(storedSettings.calorieGoal) : profile.calorieTarget,
        calorieGoalMode: manual ? "手动" : "自动"
      }),
      coach
    });
  },

  goBack() { wx.navigateBack(); },

  toggleSetting(e) {
    const field = e.currentTarget.dataset.field;
    const settings = Object.assign({}, this.data.settings, { [field]: e.detail.value });
    this.setData({ settings });
    wx.setStorageSync(SETTINGS_KEY, settings);
  },

  onCoachNameInput(e) {
    const name = String(e.detail.value || "").slice(0, 12);
    this.setData({
      "coach.name": name,
      "coach.initials": this._getInitials(name)
    });
  },

  saveCoachName() {
    const name = String(this.data.coach.name || "").trim() || DEFAULT_COACH.name;
    const coach = Object.assign({}, this.data.coach, {
      name,
      initials: this._getInitials(name)
    });
    wx.setStorageSync(COACH_KEY, { name: coach.name, avatar: coach.avatar });
    this.setData({ coach });
  },

  async chooseCoachAvatar(e) {
    const tempPath = e.detail && e.detail.avatarUrl;
    if (!tempPath) return;
    wx.showLoading({ title: "正在更新", mask: true });
    try {
      const fileId = await cloudHelper.transTempPicOne(
        tempPath,
        "ai/coach-avatar/",
        "current",
        false
      );
      if (!fileId) return;
      const coach = Object.assign({}, this.data.coach, { avatar: fileId });
      wx.setStorageSync(COACH_KEY, { name: coach.name, avatar: coach.avatar });
      this.setData({ coach });
      wx.showToast({ title: "头像已更新", icon: "success" });
    } catch (err) {
      wx.showToast({ title: "头像更新失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },

  resetCoach() {
    wx.showModal({
      title: "恢复默认教练",
      content: "将恢复默认头像和名称。",
      confirmText: "恢复",
      success: ({ confirm }) => {
        if (!confirm) return;
        wx.removeStorageSync(COACH_KEY);
        this.setData({ coach: Object.assign({}, DEFAULT_COACH) });
      }
    });
  },

  _getInitials(name) {
    const value = String(name || DEFAULT_COACH.name).trim();
    if (/^[A-Za-z]/.test(value)) return value.slice(0, 2).toUpperCase();
    return value.slice(0, 1) || "AI";
  },

  openDetail(e) {
    wx.navigateTo({ url: `detail/settings_detail?type=${e.currentTarget.dataset.type}` });
  },

  openWechatSettings() {
    wx.openSetting({
      fail: () => wx.showToast({ title: "暂无可修改权限", icon: "none" })
    });
  }
});
