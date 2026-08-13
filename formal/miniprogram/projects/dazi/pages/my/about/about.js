Page({
  data: { version: "1.0.0", statusBarHeight: 44 },
  onLoad() {
    const info = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: info.statusBarHeight || 44 });
  },
  goBack() { wx.navigateBack(); },
  copyContact() {
    wx.setClipboardData({ data: "fitness-support" });
  }
});
