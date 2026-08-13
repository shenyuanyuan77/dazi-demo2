const TABS = [
  { index: 0, icon: "home", label: "首页", path: "/projects/dazi/pages/home/index/home_index" },
  { index: 1, icon: "diet", label: "饮食", path: "/projects/dazi/pages/diet/index/diet_index" },
  { index: 2, icon: "sparkle", label: "AI 教练", path: "/projects/dazi/pages/ai/chat/ai_chat" },
  { index: 3, icon: "training", label: "训练", path: "/projects/dazi/pages/training/index/training_index" },
  { index: 4, icon: "profile", label: "我的", path: "/projects/dazi/pages/my/index/my_index" }
];

Component({
  properties: {
    current: { type: Number, value: 0 }
  },

  data: {
    list: TABS,
    isIpx: false
  },

  lifetimes: {
    attached() {
      const info = wx.getSystemInfoSync();
      this.setData({
        isIpx: !!(info.safeArea && info.safeArea.bottom < info.screenHeight)
      });
    }
  },

  methods: {
    onTabTap(e) {
      const { index, path } = e.currentTarget.dataset;
      if (Number(index) === this.data.current) return;
      this.triggerEvent("tabtap", { index: Number(index), path });
    }
  }
});
