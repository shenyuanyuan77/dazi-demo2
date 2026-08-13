const dashboardService = require("../../../biz/dashboard_service.js");
const safeTop = require("../../../../../helper/safe_top.js");

const TAB_PATHS = {
  diet: "/projects/dazi/pages/diet/index/diet_index",
  training: "/projects/dazi/pages/training/index/training_index",
  ai: "/projects/dazi/pages/ai/chat/ai_chat",
  body: "/projects/dazi/pages/my/body_metrics/body_metrics"
};

Page({
  data: {
    statusBarHeight: 44,
    safeTop: 88,
    date: "",
    calories: {
      target: 0,
      consumed: 0,
      exercise: 0,
      remaining: 0,
      percent: 0
    },
    macroList: [],
    tasks: [],
    advice: {
      title: "",
      summary: "",
      context: "",
      actions: [],
      sources: []
    },
    goal: null
  },

  onLoad() {
    this.setData(safeTop.injectInto({}));
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.setData({ current: 0 });
    this._refresh();
  },

  openTask(e) {
    const type = e.currentTarget.dataset.type;
    const url = TAB_PATHS[type];
    if (!url) return;
    if (type === "ai" || type === "body") {
      wx.navigateTo({ url });
    } else {
      wx.switchTab({ url });
    }
  },

  openChat() { wx.switchTab({ url: TAB_PATHS.ai }); },
  openBody() { wx.navigateTo({ url: TAB_PATHS.body }); },

  _refresh() {
    this.setData(dashboardService.getDashboardData());
  }
});