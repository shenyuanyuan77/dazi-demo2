const cloudHelper = require("../../../../../helper/cloud_helper.js");

Page({
  data: {
    statusBarHeight: 44,
    safeTop: 102,
    sessions: [],
    displaySessions: [],
    searchValue: "",
    loading: true,
    error: ""
  },

  onLoad() {
    const info = wx.getSystemInfoSync();
    const capsule = wx.getMenuButtonBoundingClientRect
      ? wx.getMenuButtonBoundingClientRect()
      : null;
    const statusBarHeight = info.statusBarHeight || 44;
    this.setData({
      statusBarHeight,
      safeTop: capsule && capsule.bottom
        ? capsule.bottom + 18
        : statusBarHeight + 62
    });
    this.loadSessions();
  },

  goBack() {
    wx.navigateBack();
  },

  newConversation() {
    wx.removeStorageSync("fitness_pending_ai_session");
    wx.switchTab({ url: "/projects/dazi/pages/ai/chat/ai_chat" });
  },

  async loadSessions() {
    this.setData({ loading: true, error: "" });
    try {
      const sessions = await cloudHelper.callCloudData("ai/sessions", {}, { hint: false });
      const normalized = (sessions || []).map(item => Object.assign({}, item, {
        displayTime: this._formatTime(item.AI_SESSION_EDIT_TIME)
      }));
      this.setData({ sessions: normalized, displaySessions: normalized, loading: false });
    } catch (err) {
      this.setData({ loading: false, error: "历史对话加载失败" });
    }
  },

  onSearch(e) {
    const searchValue = e.detail.value;
    const keyword = searchValue.trim().toLowerCase();
    const displaySessions = keyword
      ? this.data.sessions.filter(item => String(item.AI_SESSION_TITLE || "").toLowerCase().includes(keyword))
      : this.data.sessions;
    this.setData({ searchValue, displaySessions });
  },

  openSession(e) {
    wx.setStorageSync("fitness_pending_ai_session", e.currentTarget.dataset.id);
    wx.switchTab({ url: "/projects/dazi/pages/ai/chat/ai_chat" });
  },

  manageSession(e) {
    const sessionId = e.currentTarget.dataset.id;
    wx.showActionSheet({
      itemList: ["删除对话"],
      success: ({ tapIndex }) => {
        if (tapIndex !== 0) return;
        wx.showModal({
          title: "删除历史对话",
          content: "删除后将无法恢复。",
          confirmText: "删除",
          confirmColor: "#D64545",
          success: async ({ confirm }) => {
            if (!confirm) return;
            await cloudHelper.callCloudSumbit("ai/session_delete", { sessionId }, { title: "删除中" });
            await this.loadSessions();
          }
        });
      }
    });
  },

  _formatTime(timestamp) {
    if (!timestamp) return "";
    const value = Number(timestamp);
    const date = new Date(value < 100000000000 ? value * 1000 : value);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
      return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    }
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }
});
