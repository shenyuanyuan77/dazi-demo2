const userStorage = require("../../../biz/user_storage.js");
const fitnessStore = require("../../../store/fitness_store.js");
const goalConfig = require("../../../config/goal_config.js");
const cloudHelper = require("../../../../../helper/cloud_helper.js");
const energyTargetService = require("../../../biz/energy_target_service.js");
const PROFILE_KEY = "fitness_profile";
const DEFAULT_PROFILE = {
  nickname: "健身小白",
  currentWeight: "72.0",
  targetWeight: "65.0",
  bodyFat: "22.0",
  height: "175",
  gender: "未设置",
  birthday: ""
  ,
  goal: "body_shaping"
};

Page({
  data: {
    statusBarHeight: 44,
    safeTop: 88,
    profile: DEFAULT_PROFILE,
    loginUser: null,
    avatarFailed: false,
    profileInitial: "我",
    energyAssessment: {},
    editor: {
      visible: false,
      field: "",
      title: "",
      value: "",
      unit: "",
      inputType: "number",
      min: 0,
      max: 99999,
      options: []
    },
    genderOptions: ["未设置", "男", "女"],
    goalOptions: goalConfig.getGoalOptions().map(item => `${item.name} ${item.englishName}`),
    goalValues: goalConfig.getGoalOptions().map(item => item.goalType)
  },

  onLoad() {
    const info = wx.getSystemInfoSync();
    const capsule = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    const statusBarHeight = info.statusBarHeight || 44;
    const profile = Object.assign({}, DEFAULT_PROFILE, userStorage.get(PROFILE_KEY, {}));
    profile.goal = goalConfig.normalizeGoal(profile.goal);
    this.setData({
      statusBarHeight,
      safeTop: capsule && capsule.bottom ? capsule.bottom + 14 : statusBarHeight + 58,
      profile,
      loginUser: userStorage.getUser(),
      profileInitial: this._getProfileInitial(profile.nickname),
      energyAssessment: energyTargetService.evaluateEnergyTarget(profile)
    });
  },

  goBack() { wx.navigateBack(); },

  openEditor(e) {
    const field = e.currentTarget.dataset.field;
    const configs = {
      nickname: { title: "修改昵称", inputType: "text", unit: "", min: 0, max: 30 },
      gender: { title: "修改性别", inputType: "select", options: this.data.genderOptions },
      birthday: { title: "修改生日", inputType: "date" },
      currentWeight: { title: "修改当前体重", unit: "kg", min: 20, max: 400 },
      targetWeight: { title: "修改目标体重", unit: "kg", min: 20, max: 400 },
      bodyFat: { title: "修改体脂率", unit: "%", min: 1, max: 70 },
      height: { title: "修改身高", unit: "cm", min: 80, max: 250 }
    };
    const config = configs[field];
    if (!config) return;
    this.setData({
      editor: Object.assign({
        visible: true,
        field,
        title: "",
        value: this.data.profile[field] || "",
        unit: "",
        inputType: "number",
        min: 0,
        max: 99999,
        options: []
      }, config)
    });
  },

  closeEditor() {
    this.setData({ "editor.visible": false });
  },

  confirmEditor(e) {
    const value = e.detail.value;
    const field = this.data.editor.field;
    const patch = {
      [`profile.${field}`]: value,
      "editor.visible": false
    };
    if (field === "nickname") patch.profileInitial = this._getProfileInitial(value);
    patch.energyAssessment = energyTargetService.evaluateEnergyTarget(
      Object.assign({}, this.data.profile, { [field]: value })
    );
    this.setData(patch);
  },

  onGoal(e) {
    const goal = this.data.goalValues[Number(e.detail.value)];
    this.setData({
      "profile.goal": goal,
      energyAssessment: energyTargetService.evaluateEnergyTarget(
        Object.assign({}, this.data.profile, { goal })
      )
    });
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
      avatarFailed: false,
      profileInitial: this._getProfileInitial(profile.nickname)
    });
    wx.showToast({ title: "微信资料已同步", icon: "success" });
  },

  onAvatarError() {
    this.setData({ avatarFailed: true });
  },

  async changeWechatAvatar(e) {
    const path = e.detail && e.detail.avatarUrl;
    if (!path) return;
    if (!this.data.loginUser) {
      wx.navigateTo({ url: "../../auth/login/login" });
      return;
    }
    wx.showLoading({ title: "正在更新", mask: true });
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

  showCalorieExplanation() {
    wx.showModal({
      title: "每日目标热量计算",
      content: this.data.energyAssessment.explanation,
      showCancel: false
    });
  },

  noop() {},

  saveProfile() {
    const profile = this.data.profile;
    if (!profile.nickname.trim()) {
      wx.showToast({ title: "昵称不能为空", icon: "none" });
      return;
    }
    userStorage.set(PROFILE_KEY, profile);
    fitnessStore.recordWeight(profile.currentWeight);
    wx.showToast({ title: "资料已保存", icon: "success" });
    setTimeout(() => wx.navigateBack(), 350);
  },

  _getProfileInitial(name) {
    const value = String(name || "我").trim();
    if (/^[A-Za-z]/.test(value)) return value.slice(0, 2).toUpperCase();
    return value.slice(0, 1) || "我";
  },

  goalLabel(goal) {
    return goalConfig.getGoalConfig(goal).name;
  }
});
