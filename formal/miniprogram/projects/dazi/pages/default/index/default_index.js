const ProjectBiz = require('../../../biz/project_biz.js');
const pageHelper = require('../../../../../helper/page_helper.js');
const ActivityBiz = require('../../../biz/activity_biz.js');
const cloudHelper = require('../../../../../helper/cloud_helper.js');
const projectSetting = require('../../../public/project_setting.js');

Page({
  data: {
    isLoad: false,
    aiResults: [],
    aiDisplayResults: [],
    aiExpanded: false,
    aiLoading: false,
    activeAiTab: 'diet',
    aiEntryMode: projectSetting.AI_ENTRY_MODE || 'float',
    aiUnread: false,
    aiFabTop: 520,
    currentTab: 0,
    greeting: '',
    userName: '',
    userAvatar: '',
    searchValue: '',

    // 活动分类筛选
    cateMenus: [],
    currentCate: 0,

    // 数据列表
    dataList: { list: [], page: 1, count: 0, total: 0 },

    _params: { type: 'run' },
    sortItems: [],
    sortMenus: [],

    // 状态
    loadingMore: false,
    hasMore: true,

    // 顶部安全区高度
    statusBarHeight: 44,
    windowHeight: 667
  },

  onLoad: async function (options) {
    ProjectBiz.initPage(this);
    this._initSafeArea();
    this._getSearchMenu();
    this._setGreeting();

    this.setData({ isLoad: true });
  },

  onShow: async function () {
    if (this.data.aiEntryMode !== 'none') {
      await this._loadAiResults();
    }
  },

  onPullDownRefresh: async function () {
    await this._loadAiResults();
    this._loadData(1);
    wx.stopPullDownRefresh();
  },

  _initSafeArea: function () {
    try {
      const sysInfo = wx.getSystemInfoSync();
      const defaultFabTop = Math.max(220, (sysInfo.windowHeight || 667) - 190);
      this.setData({
        statusBarHeight: sysInfo.statusBarHeight || 44,
        windowHeight: sysInfo.windowHeight || 667,
        aiFabTop: defaultFabTop
      });
    } catch (e) {
      // fallback
    }
  },

  _setGreeting: function () {
    const hour = new Date().getHours();
    let greeting = '';
    if (hour < 6) greeting = '夜深了';
    else if (hour < 9) greeting = '早上好';
    else if (hour < 12) greeting = '上午好';
    else if (hour < 14) greeting = '中午好';
    else if (hour < 18) greeting = '下午好';
    else greeting = '晚上好';
    this.setData({ greeting });
  },

  _loadAiResults: async function () {
    this.setData({ aiLoading: true });
    try {
      const data = await cloudHelper.callCloudData('ai/home_results', {}, { hint: false });
      const aiResults = data && data.list ? data.list.slice(0, 3) : [];
      this.setData({
        aiResults,
        aiLoading: false,
        aiUnread: !!(data && data.unread),
        aiDisplayResults: this._filterAiResults(aiResults, this.data.activeAiTab)
      });
    } catch (e) {
      this.setData({ aiLoading: false });
    }
  },

  _filterAiResults: function (results, type) {
    const matched = (results || []).filter(item => item.AI_RESULT_TYPE === type);
    return (matched.length ? matched : (results || [])).slice(0, 3);
  },

  _loadData: async function (page) {
    if (this.data.loadingMore) return;
    this.setData({ loadingMore: true });

    try {
      const params = Object.assign({}, this.data._params, { page: page || 1 });
      const res = await cloudHelper.callCloudData('activity/list', params, { hint: false, title: 'bar' });
      if (res && res.list) {
        let list = res.list;
        if (page > 1) {
          list = this.data.dataList.list.concat(list);
        }
        this.setData({
          dataList: {
            list: list,
            page: page || 1,
            count: res.count || 0,
            total: res.total || 0
          },
          hasMore: list.length < (res.total || 0),
          loadingMore: false
        });
      } else {
        this.setData({ loadingMore: false });
      }
    } catch (e) {
      this.setData({ loadingMore: false });
    }
  },

  onLoadMore: function () {
    if (this.data.hasMore && !this.data.loadingMore) {
      this._loadData(this.data.dataList.page + 1);
    }
  },

  openAi: function (e) {
    const sessionId = e && e.currentTarget ? e.currentTarget.dataset.session : '';
    wx.navigateTo({
      url: '../../ai/chat/ai_chat' + (sessionId ? '?sessionId=' + sessionId : '')
    });
  },

  toggleAiCard: function () {
    if (this.data.aiLoading) return;
    wx.vibrateShort({ type: 'light' });
    this.setData({ aiExpanded: !this.data.aiExpanded });
  },

  stopPropagation: function () {},

  switchAiTab: function (e) {
    const activeAiTab = e.currentTarget.dataset.tab;
    wx.vibrateShort({ type: 'light' });
    this.setData({
      activeAiTab,
      aiDisplayResults: this._filterAiResults(this.data.aiResults, activeAiTab)
    });
  },

  openCurrentAi: function () {
    const current = this.data.aiDisplayResults[0] || {};
    wx.vibrateShort({ type: 'light' });
    wx.navigateTo({
      url: '../../ai/chat/ai_chat' + (current.AI_RESULT_SESSION_ID ? '?sessionId=' + current.AI_RESULT_SESSION_ID : '')
    });
  },

  openAiFromFab: function () {
    if (this._fabMoved) return;
    wx.vibrateShort({ type: 'medium' });
    this.setData({ aiUnread: false });
    this.openAi();
  },

  showAiMenu: function () {
    if (this.data.aiLoading) return;
    wx.vibrateShort({ type: 'medium' });
    wx.showActionSheet({
      itemList: ['查看历史记录', '分享给搭子', '清空当前结果'],
      success: res => {
        if (res.tapIndex === 0) {
          wx.navigateTo({ url: '../../ai/chat/ai_chat?history=1' });
        } else if (res.tapIndex === 1) {
          wx.showShareMenu({ menus: ['shareAppMessage'] });
          wx.showToast({ title: '请点击右上角分享', icon: 'none' });
        } else if (res.tapIndex === 2) {
          this.clearCurrentAiResult();
        }
      }
    });
  },

  clearCurrentAiResult: function () {
    wx.showModal({
      title: '清空当前结果',
      content: '清空后仍可在历史对话中查看。',
      confirmText: '清空',
      confirmColor: '#FF3B30',
      success: res => {
        if (!res.confirm) return;
        const current = this.data.aiDisplayResults[0];
        const aiResults = current
          ? this.data.aiResults.filter(item => item.AI_RESULT_ID !== current.AI_RESULT_ID)
          : this.data.aiResults;
        this.setData({
          aiResults,
          aiDisplayResults: this._filterAiResults(aiResults, this.data.activeAiTab)
        });
      }
    });
  },

  onAiFabTouchStart: function (e) {
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    this._fabMoved = false;
    this._fabStartY = touch.clientY;
    this._fabStartTop = this.data.aiFabTop;
  },

  onAiFabTouchMove: function (e) {
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    const deltaY = touch.clientY - this._fabStartY;
    if (Math.abs(deltaY) > 4) this._fabMoved = true;
    const maxTop = Math.max(240, this.data.windowHeight - 150);
    this.setData({ aiFabTop: Math.min(maxTop, Math.max(140, this._fabStartTop + deltaY)) });
  },

  onAiFabTouchEnd: function () {
    if (this._fabMoved) wx.vibrateShort({ type: 'light' });
    setTimeout(() => { this._fabMoved = false; }, 80);
  },

  refreshAiResult: async function (e) {
    const resultId = e.currentTarget.dataset.id;
    if (!resultId) return;
    await cloudHelper.callCloudSumbit('ai/refresh', { resultId }, { title: 'AI 正在更新' });
    await this._loadAiResults();
  },

  onSearchInput: function (e) {
    this.setData({ searchValue: e.detail.value });
  },

  onSearch: function () {
    const val = this.data.searchValue.trim();
    if (val) {
      wx.navigateTo({
        url: '../../search/search?search=' + encodeURIComponent(val)
      });
    }
  },

  onCateChange: function (e) {
    const idx = e.currentTarget.dataset.index;
    const cate = this.data.cateMenus[idx];
    this.setData({
      currentCate: idx,
      _params: Object.assign({}, this.data._params, { cateId: cate.value || '' }),
      dataList: { list: [], page: 1, count: 0, total: 0 }
    });
    this._loadData(1);
  },

  goActivityDetail: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: '../../activity/detail/activity_detail?id=' + id
    });
  },

  goPublish: function () {
    wx.navigateTo({
      url: '../../activity_client/add/activity_add'
    });
  },

  onTabTap: function (e) {
    const { path } = e.detail;
    wx.switchTab({ url: path });
  },

  url: async function (e) {
    pageHelper.url(e, this);
  },

  bindCommListCmpt: function (e) {
    pageHelper.commListListener(this, e);
  },

  _getSearchMenu: function () {
    let sortItem1 = [{ label: '全部', type: 'cateId', value: '' }];
    if (ActivityBiz.getCateList().length > 1) {
      sortItem1 = sortItem1.concat(ActivityBiz.getCateList());
    }
    this.setData({
      cateMenus: sortItem1,
      sortMenus: sortItem1
    });
  },

  onShareAppMessage: function () {
    return { title: '健身搭子 — 找到你的运动伙伴' };
  }
});
