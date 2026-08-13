const cloudHelper = require('../../../../../helper/cloud_helper.js');
const pageHelper = require('../../../../../helper/page_helper.js');
const timeHelper = require('../../../../../helper/time_helper.js'); 
const ProjectBiz = require('../../../biz/project_biz.js');

Page({
	/**
	 * 椤甸潰鐨勫垵濮嬫暟鎹?	 */
	data: {
		currentTab: 3,
		isLoad: false,
		list: [],

		day: '',
		hasDays: []
	},

	/**
	 * 鐢熷懡鍛ㄦ湡鍑芥暟--鐩戝惉椤甸潰鍔犺浇
	 */
	onLoad: async function (options) {
		ProjectBiz.initPage(this);
	},

	_loadList: async function () {
		let params = {
			day: this.data.day
		}
		let opts = {
			title: this.data.isLoad ? 'bar' : 'bar'
		}
		try {
			this.setData({
				list: null
			});
			await cloudHelper.callCloudSumbit('activity/list_by_day', params, opts).then(res => {
				this.setData({
					list: res.data,
					isLoad: true
				});
			});
		} catch (err) {
			console.error(err);
		}
	},

	_loadHasList: async function () {
		let params = {
			day: timeHelper.time('Y-M-D')
		}
		let opts = {
			title: 'bar'
		}
		try {
			await cloudHelper.callCloudSumbit('activity/list_has_day', params, opts).then(res => {
				this.setData({
					hasDays: res.data,
				});
			});
		} catch (err) {
			console.error(err);
		}
	},

	/**
	 * 鐢熷懡鍛ㄦ湡鍑芥暟--鐩戝惉椤甸潰鍒濇娓叉煋瀹屾垚
	 */
	onReady: function () {

	},

	/**
	 * 鐢熷懡鍛ㄦ湡鍑芥暟--鐩戝惉椤甸潰鏄剧ず
	 */
	onShow: async function () {
		if (!this.data.day) {
			this.setData({
				day: timeHelper.time('Y-M-D')
			}, async () => {
				await this._loadHasList();
				await this._loadList();
			});
		}
		else {
			await this._loadHasList();
			await this._loadList();
		}
	},

	/**
	 * 鐢熷懡鍛ㄦ湡鍑芥暟--鐩戝惉椤甸潰闅愯棌
	 */
	onHide: function () {

	},

	/**
	 * 鐢熷懡鍛ㄦ湡鍑芥暟--鐩戝惉椤甸潰鍗歌浇
	 */
	onUnload: function () {

	},

	/**
	 * 椤甸潰鐩稿叧浜嬩欢澶勭悊鍑芥暟--鐩戝惉鐢ㄦ埛涓嬫媺鍔ㄤ綔
	 */
	onPullDownRefresh: async function () {
		await this._loadHasList();
		await this._loadList();
		wx.stopPullDownRefresh();
	},

	/**
	 * 鐢ㄦ埛鐐瑰嚮鍙充笂瑙掑垎浜?	 */
	onShareAppMessage: function () {

	},


	onTabTap: function (e) {
		const { path } = e.detail;
		wx.switchTab({ url: path });
	},

	onTabTap: function (e) {
		const { path } = e.detail;
		wx.switchTab({ url: path });
	},

	bindClickCmpt: async function (e) {
		let day = e.detail.day;
		this.setData({
			day
		}, async () => {
			await this._loadList();
		})

	},

	bindMonthChangeCmpt: function (e) { 
	},

	url: async function (e) {
		pageHelper.url(e, this);
	},
})
