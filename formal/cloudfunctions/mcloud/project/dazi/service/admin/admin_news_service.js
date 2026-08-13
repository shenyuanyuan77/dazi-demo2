/**
 * Notes: 资讯后台管理
 */

const BaseProjectAdminService = require('./base_project_admin_service.js'); 
const dataUtil = require('../../../../framework/utils/data_util.js');
const util = require('../../../../framework/utils/util.js'); 
const cloudUtil = require('../../../../framework/cloud/cloud_util.js');

const NewsModel = require('../../model/news_model.js');

class AdminNewsService extends BaseProjectAdminService {


	/**添加资讯 */
	async insertNews({
		title,
		cateId, //分类
		cateName,
		order,
		desc = '',
		forms
	}) {


		// 重复性判断
		let where = {
			NEWS_TITLE: title,
		}
		if (await NewsModel.count(where))
			this.AppError('该标题已经存在');

		// 赋值 
		let data = {};
		data.NEWS_TITLE = title;
		data.NEWS_CATE_ID = cateId;
		data.NEWS_CATE_NAME = cateName;
		data.NEWS_ORDER = order;
		data.NEWS_DESC = dataUtil.fmtText(desc, 100);

		data.NEWS_OBJ = dataUtil.dbForms2Obj(forms);
		data.NEWS_FORMS = forms;

		let id = await NewsModel.insert(data);

		let qr = await this.genDetailQr('news', id);
		NewsModel.edit(id, { NEWS_QR: qr });

		return {
			id
		};
	}

	/**删除资讯数据 */
	async delNews(id) {
		let where = {
			_id: id
		}

		// 取出图片数据
		let news = await NewsModel.getOne(where, 'NEWS_CONTENT,NEWS_PIC,NEWS_FORMS,NEWS_QR');
		if (!news) return;

		await NewsModel.del(where);

		// 异步删除图片  
		cloudUtil.deleteFiles(news.NEWS_PIC);

		// 处理 新旧文件
		cloudUtil.handlerCloudFilesByRichEditor(news.NEWS_CONTENT, []);
		cloudUtil.handlerCloudFilesForForms(news.NEWS_FORMS, []);
		cloudUtil.deleteFiles(news.NEWS_QR);


	}

	/**获取资讯信息 */
	async getNewsDetail(id) {
		let fields = '*';

		let where = {
			_id: id
		}
		let news = await NewsModel.getOne(where, fields);
		if (!news) return null;

		return news;
	}

	// 更新forms信息
	async updateNewsForms({
		id,
		hasImageForms
	}) {
		await NewsModel.editForms(id, 'NEWS_FORMS', 'NEWS_OBJ', hasImageForms);

	}


	/**
	 * 更新富文本详细的内容及图片信息
	 * @returns 返回 urls数组 [url1, url2, url3, ...]
	 */
	async updateNewsContent({
		id,
		content // 富文本数组
	}) {

		// 获取数据库里的图片数据
		let news = await NewsModel.getOne(id, 'NEWS_CONTENT');

		// 处理 新旧文件
		content = await cloudUtil.handlerCloudFilesByRichEditor(news.NEWS_CONTENT, content);

		//更新数据库
		let data = {
			NEWS_CONTENT: content
		};
		await NewsModel.edit(id, data);

	}

	/**
	 * 更新资讯图片信息
	 * @returns 返回 urls数组 [url1, url2, url3, ...]
	 */
	async updateNewsPic({
		id,
		imgList // 图片数组
	}) {

		// 获取数据库里的图片数据
		let news = await NewsModel.getOne(id, 'NEWS_PIC');

		// 处理 新旧文件
		let picList = await cloudUtil.handlerCloudFiles(news.NEWS_PIC, imgList);

		//更新数据库
		let data = {
			NEWS_PIC: picList
		};
		await NewsModel.edit(id, data);

	}


	/**更新资讯数据 */
	async editNews({
		id,
		title,
		cateId, //分类
		cateName,
		order,
		desc = '',
		forms
	}) {

		// 重复性判断
		let where = {
			NEWS_TITLE: title,
			_id: ['<>', id]
		}
		if (await NewsModel.count(where))
			this.AppError('该标题已经存在');

		// 异步处理 新旧文件
		let oldForms = await NewsModel.getOneField(id, 'NEWS_FORMS');
		if (!oldForms) return;
		cloudUtil.handlerCloudFilesForForms(oldForms, forms);


		// 赋值 
		let data = {};
		data.NEWS_TITLE = title;
		data.NEWS_CATE_ID = cateId;
		data.NEWS_CATE_NAME = cateName;
		data.NEWS_ORDER = order;
		data.NEWS_DESC = dataUtil.fmtText(desc, 100);

		data.NEWS_OBJ = dataUtil.dbForms2Obj(forms);
		data.NEWS_FORMS = forms;

		await NewsModel.edit(id, data);

		// 小程序码
		let qr = await this.genDetailQr('news', id);
		NewsModel.edit(id, { NEWS_QR: qr });

	}

	/**取得资讯分页列表 */
	async getAdminNewsList({
		search, // 搜索条件
		sortType, // 搜索菜单
		sortVal, // 搜索菜单
		orderBy, // 排序
		whereEx, //附加查询条件
		page,
		size,
		isTotal = true,
		oldTotal
	}) {

		orderBy = orderBy || {
			'NEWS_ORDER': 'asc',
			'NEWS_ADD_TIME': 'desc'
		};
		let fields = 'NEWS_TITLE,NEWS_DESC,NEWS_CATE_ID,NEWS_CATE_NAME,NEWS_EDIT_TIME,NEWS_ADD_TIME,NEWS_ORDER,NEWS_STATUS,NEWS_CATE2_NAME,NEWS_VOUCH,NEWS_QR,NEWS_OBJ';

		let where = {};
		where.and = {
			_pid: this.getProjectId() //复杂的查询在此处标注PID
		};

		if (util.isDefined(search) && search) {
			where.or = [
				{ NEWS_TITLE: ['like', search] },
			];

		} else if (sortType && util.isDefined(sortVal)) {
			// 搜索菜单
			switch (sortType) {
				case 'cateId': {
					where.and.NEWS_CATE_ID = String(sortVal);
					break;
				}
				case 'status': {
					where.and.NEWS_STATUS = Number(sortVal);
					break;
				}
				case 'top': {
					where.and.NEWS_ORDER = 0;
					break;
				}
				case 'sort': {
					orderBy = this.fmtOrderBySort(sortVal, 'NEWS_ADD_TIME');
					break;
				}

			}
		}

		return await NewsModel.getList(where, fields, orderBy, page, size, isTotal, oldTotal);
	}

	/**修改资讯状态 */
	async statusNews(id, status) {
		let data = {
			NEWS_STATUS: status
		}
		let where = {
			_id: id,
		}

		return await NewsModel.edit(where, data);
	}

	/**置顶与排序设定 */
	async sortNews(id, sort) {
		sort = Number(sort);
		let data = {};
		data.NEWS_ORDER = sort;
		await NewsModel.edit(id, data);
	}
}

module.exports = AdminNewsService;