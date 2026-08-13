const ProjectBiz = require('../../../biz/project_biz.js');
const pageHelper = require('../../../../../helper/page_helper.js');
const timeHelper = require('../../../../../helper/time_helper.js');
const ActivityBiz = require('../../../biz/activity_biz.js');
const projectSetting = require('../../../public/project_setting.js');

Page({

	data: {

		isLoad: false,
		currentTab: 1,
		_params: null,

		sortMenus: [],
		sortItems: [],

		isShowCate: projectSetting.ACTIVITY_CATE.length > 1
	},

	/**
		* 鐢熷懡鍛ㄦ湡鍑芥暟--鐩戝惉椤甸潰鍔犺浇
		*/
	onLoad: async function (options) {
		ProjectBiz.initPage(this);

		this._getSearchMenu();
		this.setData({
			_params: {
				type: 'his'
			},

			isLoad: true
		});

	},

	/**
	 * 鐢熷懡鍛ㄦ湡鍑芥暟--鐩戝惉椤甸潰鍒濇娓叉煋瀹屾垚
	 */
	onReady: function () { },

	/**
	 * 鐢熷懡鍛ㄦ湡鍑芥暟--鐩戝惉椤甸潰鏄剧ず
	 */
	onShow: async function () {

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

	url: async function (e) {
		pageHelper.url(e, this);
	},

	bindCommListCmpt: function (e) {
		pageHelper.commListListener(this, e);
	},


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

	_getSearchMenu: function () {

		let sortItem1 = [{
			label: '鍏ㄩ儴',
			type: 'cateId',
			value: ''
		}];

		if (ActivityBiz.getCateList().length > 1)
			sortItem1 = sortItem1.concat(ActivityBiz.getCateList());

		let sortItems = [];

		this.setData({
			sortItems,
			sortMenus: sortItem1
		})

	}

})
