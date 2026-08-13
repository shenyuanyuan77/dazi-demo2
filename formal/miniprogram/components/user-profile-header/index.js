Component({
  properties: {
    user: { type: Object, value: null },
    nickname: { type: String, value: "未登录" },
    initial: { type: String, value: "我" },
    goalLabel: { type: String, value: "均衡塑形" },
    avatarFailed: { type: Boolean, value: false }
  },

  methods: {
    openProfile() {
      this.triggerEvent("openprofile");
    },

    syncWechat() {
      this.triggerEvent("sync");
    },

    chooseAvatar(e) {
      this.triggerEvent("avatar", { avatarUrl: e.detail && e.detail.avatarUrl });
    },

    avatarError() {
      this.triggerEvent("avatarerror");
    },

    stop() {}
  }
});
