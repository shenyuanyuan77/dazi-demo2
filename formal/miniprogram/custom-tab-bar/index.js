const TABS = [
  { index: 0, icon: "home", iconPath: "/images/ui-icons/home.png", activeIconPath: "/images/ui-icons/home-active.png", label: "首页", path: "/projects/dazi/pages/home/index/home_index" },
  { index: 1, icon: "diet", iconPath: "/images/ui-icons/diet.png", activeIconPath: "/images/ui-icons/diet-active.png", label: "饮食", path: "/projects/dazi/pages/diet/index/diet_index" },
  { index: 2, icon: "sparkle", label: "AI 教练", path: "/projects/dazi/pages/ai/chat/ai_chat" },
  { index: 3, icon: "training", iconPath: "/images/ui-icons/training.png", activeIconPath: "/images/ui-icons/training-active.png", label: "训练", path: "/projects/dazi/pages/training/index/training_index" },
  { index: 4, icon: "profile", iconPath: "/images/ui-icons/profile.png", activeIconPath: "/images/ui-icons/profile-active.png", label: "我的", path: "/projects/dazi/pages/my/index/my_index" }
];

const TAB_PATHS = TABS.map(item => item.path);

function getInitialTab() {
  const app = getApp();
  const pending = app && app.globalData && app.globalData.pendingTabIndex;
  if (Number.isInteger(pending) && pending >= 0) return pending;
  const pages = getCurrentPages();
  const page = pages[pages.length - 1];
  const current = page ? TAB_PATHS.indexOf(`/${page.route}`) : 0;
  return current >= 0 ? current : 0;
}

Component({
  data: {
    list: TABS,
    current: getInitialTab(),
    hidden: false
  },

  lifetimes: {
    attached() {
      this._lastTapAt = 0;
      this.syncCurrentTab();
    }
  },

  pageLifetimes: {
    show() {
      this.syncCurrentTab();
    }
  },

  methods: {
    syncCurrentTab() {
      const pages = getCurrentPages();
      const page = pages[pages.length - 1];
      if (!page) return;
      const current = TAB_PATHS.indexOf(`/${page.route}`);
      if (current < 0) return;
      const app = getApp();
      if (app && app.globalData) app.globalData.pendingTabIndex = current;
      if (current !== this.data.current) this.setData({ current });
    },

    onTabTap(e) {
      const { index, path } = e.currentTarget.dataset;
      const target = Number(index);
      if (target === this.data.current) return;
      const now = Date.now();
      if (now - this._lastTapAt < 100) return;
      this._lastTapAt = now;
      const previous = this.data.current;
      const app = getApp();
      if (app && app.globalData) app.globalData.pendingTabIndex = target;
      this._vibrate();
      this.setData({ current: target }, () => {
        wx.switchTab({
          url: path,
          fail: () => {
            this._lastTapAt = 0;
            if (app && app.globalData) app.globalData.pendingTabIndex = previous;
            this.setData({ current: previous });
          }
        });
      });
    },

    _vibrate() {
      if (!wx.vibrateShort) return;
      try {
        wx.vibrateShort({ type: "light" });
      } catch (error) {
        wx.vibrateShort();
      }
    }
  }
});
