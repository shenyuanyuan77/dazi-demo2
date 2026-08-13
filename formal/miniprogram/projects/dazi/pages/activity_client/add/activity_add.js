const AdminActivityBiz = require('../../../biz/admin_activity_biz.js');
const ProjectBiz = require('../../../biz/project_biz.js');
const PassportBiz = require('../../../../../comm/biz/passport_biz.js');
const behavior = require('../../admin/activity/add/admin_activity_add_bh.js');

Page({
	behaviors: [behavior],

	/**
	 * 椤甸潰鐨勫垵濮嬫暟鎹?
	 */
	data: {
		currentTab: 2,
		route: 'client',
		returnUrl: '../../my/index/my_index',
	},

	/**
	 * 鐢熷懡鍛ㄦ湡鍑芥暟--鐩戝惉椤甸潰鍔犺浇
	 */
	onLoad: async function (options) {
		ProjectBiz.initPage(this);

		this.setData(AdminActivityBiz.initFormData());
		this.setData({
			isLoad: true
		});
	},


	onTabTap: function (e) {
		const { path } = e.detail;
		wx.switchTab({ url: path });
	},

	onTabTap: function (e) {
		const { path } = e.detail;
		wx.switchTab({ url: path });
	},

	bindFormSubmit: async function () {
		if (!await PassportBiz.loginMustCancelWin(this)) return;

		await this._bindFormSubmit();
	}

})
