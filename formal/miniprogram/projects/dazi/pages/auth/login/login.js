const cloudHelper = require("../../../../../helper/cloud_helper.js");
const userStorage = require("../../../biz/user_storage.js");

Page({
  data: {
    statusBarHeight: 44,
    loading: false,
    avatarUrl: "",
    nickname: ""
  },

  async onLoad() {
    const info = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: info.statusBarHeight || 44 });
    if (userStorage.getUserId()) {
      try {
        await userStorage.hydrate();
      } catch (error) {}
      this._enterApp();
    }
  },

  chooseAvatar(e) {
    this.setData({ avatarUrl: e.detail && e.detail.avatarUrl || "" });
  },

  inputNickname(e) {
    this.setData({ nickname: String(e.detail.value || "").trim() });
  },

  login() {
    if (this.data.loading) return;
    if (!this.data.nickname) {
      wx.showToast({ title: "请填写微信昵称", icon: "none" });
      return;
    }
    this.setData({ loading: true });
    wx.login({
      success: result => {
        if (!result.code) {
          this._finishWithError("微信登录未返回有效凭证，请重试");
          return;
        }
        this._createSession();
      },
      fail: () => this._finishWithError("微信登录失败，请重试")
    });
  },

  async _createSession() {
    try {
      const session = await cloudHelper.callCloudData("auth/session", {}, { hint: false });
      if (!session || !session.userId) throw new Error("EMPTY_USER");

      let avatar = "";
      if (this.data.avatarUrl) {
        const uploaded = await cloudHelper.transTempPics(
          [this.data.avatarUrl],
          "user/avatar/",
          session.userId,
          "wechat"
        );
        avatar = uploaded && uploaded[0] || "";
      }

      const account = {
        userId: session.userId,
        nickname: this.data.nickname,
        avatar
      };
      wx.setStorageSync(userStorage.AUTH_KEY, account);
      await userStorage.hydrate();
      const existingProfile = userStorage.get("fitness_profile", {});
      userStorage.set("fitness_profile", Object.assign({}, existingProfile, {
        nickname: account.nickname,
        avatar: account.avatar
      }));
      this._enterApp();
    } catch (error) {
      this._finishWithError("登录服务暂不可用，请稍后重试");
    }
  },

  _enterApp() {
    wx.reLaunch({ url: "../../home/index/home_index" });
  },

  _finishWithError(message) {
    this.setData({ loading: false });
    wx.showToast({ title: message, icon: "none" });
  }
});
