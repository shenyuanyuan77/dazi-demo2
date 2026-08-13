const cacheHelper = require("../../../../../helper/cache_helper.js");
const userStorage = require("../../../biz/user_storage.js");
const fitnessStore = require("../../../store/fitness_store.js");
const goalConfig = require("../../../config/goal_config.js");
const cloudHelper = require("../../../../../helper/cloud_helper.js");
const safeTop = require("../../../../../helper/safe_top.js");
const PROFILE_KEY = "fitness_profile";

const DEFAULT_PROFILE = {
  nickname: "健身小白",
  currentWeight: "72.0",
  targetWeight: "65.0",
  bodyFat: "22.0",
  height: "175",
  goal: "body_shaping",
  waist: "",
  hip: "",
  chest: ""
};

Page({
  data: {
    statusBarHeight: 44,
    safeTop: 88,
    profile: DEFAULT_PROFILE,
    loginUser: null,
    avatarFailed: false,
    accountName: "健身用户",
    profileInitial: "我",
    chartWidth: 320,
    weightChart: {
      labels: [],
      points: [],
      segments: []
    },
    editingField: "",
    editingLabel: "",
    editingUnit: "",
    editingValue: "",
    keyboardHeight: 0,
    metrics: [],
    primaryMetrics: [],
    bodyMetrics: [],
    goalOptions: goalConfig.getGoalOptions(),
    selectedGoal: goalConfig.GOAL_TYPES.BODY_SHAPING
  },

  onLoad() {
    const info = wx.getSystemInfoSync();
    const loginUser = userStorage.getUser();
    const profile = Object.assign({}, DEFAULT_PROFILE, userStorage.get(PROFILE_KEY, {}));
    profile.goal = goalConfig.normalizeGoal(profile.goal);
    if (loginUser && loginUser.nickname && !userStorage.get(PROFILE_KEY, {}).nickname) {
      profile.nickname = loginUser.nickname;
    }
    this.setData(Object.assign(safeTop.injectInto({}), {
      profile,
      loginUser,
      accountName: loginUser && loginUser.nickname
        ? loginUser.nickname
        : profile.nickname,
      profileInitial: this._getProfileInitial(profile.nickname),
      chartWidth: Math.max(280, (info.windowWidth || 375) - 60),
      selectedGoal: profile.goal
    }));
    this._syncMetrics();
  },

  onReady() {
    this._drawWeightChart();
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.setData({ current: 4 });
    const loginUser = userStorage.getUser();
    const profile = Object.assign({}, DEFAULT_PROFILE, userStorage.get(PROFILE_KEY, {}));
    profile.goal = goalConfig.normalizeGoal(profile.goal);
    this.setData({
      profile,
      loginUser,
      accountName: loginUser && loginUser.nickname
        ? loginUser.nickname
        : profile.nickname,
      profileInitial: this._getProfileInitial(profile.nickname),
      selectedGoal: profile.goal
    });
    this._syncMetrics();
    this._drawWeightChart();
  },

  _syncMetrics() {
    const profile = this.data.profile;
    const primaryMetrics = [
      { field: "currentWeight", label: "当前体重", value: profile.currentWeight, unit: "kg" },
      { field: "targetWeight", label: "目标体重", value: profile.targetWeight, unit: "kg" },
      { field: "bodyFat", label: "体脂率", value: profile.bodyFat, unit: "%" },
      { field: "height", label: "身高", value: profile.height, unit: "cm" }
    ];
    this.setData({
      primaryMetrics,
      metrics: primaryMetrics.concat([
        {
          field: "calorieTarget",
          label: "每日热量目标",
          value: fitnessStore.getUserProfile().calorieTarget,
          unit: "kcal",
          readonly: true
        }
      ]),
      bodyMetrics: [
        { field: "waist", label: "腰围", value: profile.waist || "--", unit: "cm" },
        { field: "hip", label: "臀围", value: profile.hip || "--", unit: "cm" },
        { field: "chest", label: "胸围", value: profile.chest || "--", unit: "cm" }
      ]
    });
  },

  selectGoal(e) {
    const selectedGoal = fitnessStore.setGoal(e.currentTarget.dataset.goal);
    const profile = Object.assign({}, this.data.profile, { goal: selectedGoal });
    this.setData({ selectedGoal, profile });
    wx.showToast({ title: "目标已更新", icon: "success" });
  },

  editMetric(e) {
    const { field, label, unit, value } = e.currentTarget.dataset;
    if (field === "calorieTarget") {
      const assessment = fitnessStore.getUserProfile().energyAssessment || {};
      wx.showModal({
        title: "每日热量目标说明",
        content: assessment.explanation || "系统会根据你的目标、体型和活动估算每日热量目标，可在设置页手动覆盖。",
        showCancel: false
      });
      return;
    }
    this.setData({
      editingField: field,
      editingLabel: label,
      editingUnit: unit,
      editingValue: value
    });
  },

  closeEditor() {
    wx.hideKeyboard();
    this.setData({ editingField: "", editingValue: "", keyboardHeight: 0 });
  },

  onMetricInput(e) {
    this.setData({ editingValue: e.detail.value.replace(/[^\d.]/g, "") });
  },

  saveMetric() {
    const value = this.data.editingValue.trim();
    if (!value || !Number(value)) {
      wx.showToast({ title: "请输入有效数值", icon: "none" });
      return;
    }
    const profile = Object.assign({}, this.data.profile, {
      [this.data.editingField]: value
    });
    userStorage.set(PROFILE_KEY, profile);
    if (this.data.editingField === "currentWeight") {
      fitnessStore.recordWeight(value);
    }
    wx.hideKeyboard();
    this.setData({ profile, editingField: "", editingValue: "", keyboardHeight: 0 });
    this._syncMetrics();
    this._drawWeightChart();
  },

  confirmMetricEditor(e) {
    this.setData({ editingValue: e.detail.value }, () => this.saveMetric());
  },

  onAvatarError() {
    this.setData({ avatarFailed: true });
  },

  syncWechatProfile() {
    if (!this.data.loginUser) {
      wx.navigateTo({ url: "../../auth/login/login" });
      return;
    }
    const profile = Object.assign({}, this.data.profile, {
      nickname: this.data.loginUser.nickname || this.data.profile.nickname,
      avatar: this.data.loginUser.avatar || this.data.profile.avatar
    });
    userStorage.set(PROFILE_KEY, profile);
    this.setData({
      profile,
      accountName: profile.nickname,
      avatarFailed: false
    });
    wx.showToast({ title: "已同步微信资料", icon: "success" });
  },

  async changeWechatAvatar(e) {
    const path = e.detail && e.detail.avatarUrl;
    if (!path) return;
    if (!this.data.loginUser) {
      wx.navigateTo({ url: "../../auth/login/login" });
      return;
    }
    wx.showLoading({ title: "上传中", mask: true });
    try {
      const avatar = await cloudHelper.transTempPicOne(path, "user/avatar/", "current", false);
      if (!avatar) throw new Error("EMPTY_AVATAR_URL");
      const loginUser = Object.assign({}, this.data.loginUser, { avatar });
      wx.setStorageSync(userStorage.AUTH_KEY, loginUser);
      const profile = Object.assign({}, this.data.profile, { avatar });
      userStorage.set(PROFILE_KEY, profile);
      this.setData({ loginUser, profile, avatarFailed: false });
      wx.showToast({ title: "头像已更新", icon: "success" });
    } catch (error) {
      wx.showToast({ title: "头像更新失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },

  openNicknameEditor() {
    wx.showModal({
      title: "修改昵称",
      editable: true,
      placeholderText: this.data.profile.nickname,
      success: ({ confirm, content }) => {
        if (!confirm || !content.trim()) return;
        const profile = Object.assign({}, this.data.profile, { nickname: content.trim() });
        userStorage.set(PROFILE_KEY, profile);
        this.setData({ profile });
      }
    });
  },

  openProfileEditor() {
    wx.navigateTo({ url: "../profile/profile_edit" });
  },

  openBodyMetrics() {
    wx.navigateTo({ url: "../body_metrics/body_metrics" });
  },

  openAppSettings() {
    wx.navigateTo({ url: "../settings/settings" });
  },

  openSystemSettings() {
    wx.openSetting({
      fail: () => wx.showToast({ title: "无法打开系统设置", icon: "none" })
    });
  },

  clearCache() {
    wx.showModal({
      title: "清除缓存",
      content: "将清除饮食记录、训练计划、训练统计和已应用的 AI 建议，该操作不可恢复。",
      confirmText: "清除",
      confirmColor: "#D64545",
      success: ({ confirm }) => {
        if (!confirm) return;
        userStorage.remove("fitness_diet_records");
        userStorage.remove("fitness_training_plan");
        userStorage.remove("fitness_workout_stats");
        userStorage.remove("fitness_applied_agent_proposals");
        wx.showToast({ title: "缓存已清除", icon: "success" });
      }
    });
  },

  logout() {
    wx.showModal({
      title: "退出登录",
      content: "退出后需要重新登录才能继续同步账号信息，确定现在退出吗？",
      confirmText: "退出",
      success: ({ confirm }) => {
        if (!confirm) return;
        wx.removeStorageSync(userStorage.AUTH_KEY);
        wx.reLaunch({ url: "../../auth/login/login" });
      }
    });
  },

  showAbout() {
    wx.navigateTo({ url: "../about/about" });
  },

  noop() {},

  _getProfileInitial(name) {
    const value = String(name || "我").trim();
    if (/^[A-Za-z]/.test(value)) return value.slice(0, 2).toUpperCase();
    return value.slice(0, 1) || "我";
  },

  _drawWeightChart() {
    if (!this.data.chartWidth) return;
    const width = this.data.chartWidth;
    const height = 150;
    const padding = { left: 30, right: 12, top: 18, bottom: 28 };
    const history = fitnessStore.getWeightHistory();
    const values = history.map(item => Number(item.value)).filter(Boolean);
    if (!values.length) values.push(Number(this.data.profile.currentWeight) || 72);
    const rawMin = Math.min.apply(null, values);
    const rawMax = Math.max.apply(null, values);
    const min = Math.floor(rawMin - 1);
    const max = Math.ceil(rawMax + 1);
    const points = values.map((value, index) => ({
      x: values.length === 1
        ? width / 2
        : padding.left + index * ((width - padding.left - padding.right) / (values.length - 1)),
      y: padding.top + (max - value) / (max - min) * (height - padding.top - padding.bottom),
      value
    }));
    const segments = points.slice(1).map((point, index) => {
      const previous = points[index];
      const dx = point.x - previous.x;
      const dy = point.y - previous.y;
      return {
        x: previous.x,
        y: previous.y,
        length: Math.sqrt(dx * dx + dy * dy),
        angle: Math.atan2(dy, dx) * 180 / Math.PI
      };
    });
    this.setData({
      weightChart: {
        labels: [
          { value: max, y: padding.top },
          { value: Math.round((max + min) / 2), y: Math.round(height / 2) },
          { value: min, y: height - padding.bottom }
        ],
        points,
        segments
      }
    });
  }
});
