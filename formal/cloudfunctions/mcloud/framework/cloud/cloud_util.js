/**
 * Notes: 云基本操作模块
 */
const cloudBase = require('./cloud_base.js');
const config = require('../../config/config.js');
const https = require('https');
const { URL } = require('url');

function log(method, err, level = 'error') {
	const cloud = cloudBase.getCloud();
	const log = cloud.logger();
	log.error({
		method: method,
		errCode: err.code,
		errMsg: err.message,
		errStack: err.stack
	});
}

async function getTempFileURLOne(fileID) {
	if (!fileID) return '';

	const cloud = cloudBase.getCloud();
	let result = await cloud.getTempFileURL({
		fileList: [fileID],
	})
	if (result && result.fileList && result.fileList[0] && result.fileList[0].tempFileURL)
		return result.fileList[0].tempFileURL;
	return '';
}

async function getTempFileURL(tempFileList, isValid = false) {
	if (!tempFileList || tempFileList.length == 0) return [];

	const cloud = cloudBase.getCloud();
	let result = await cloud.getTempFileURL({
		fileList: tempFileList,
	})
	console.log(result);

	let list = result.fileList;
	let outList = [];
	for (let i = 0; i < list.length; i++) {
		let pic = {};
		if (list[i].status == 0) {
			//获取到地址的
			pic.url = list[i].tempFileURL;
			pic.cloudId = list[i].fileID;
			outList.push(pic)
		} else {
			//未获取到地址的（已经转换过的)
			if (!isValid) {
				pic.url = list[i].fileID; // fileID为URL, tempFileURL为空
				pic.cloudId = list[i].fileID;
				outList.push(pic)
			}
		}
	}
	return outList;
}

async function getFileDataURL(fileID, maxBytes = 10 * 1024 * 1024) {
	fileID = String(fileID || '').trim();
	if (!fileID) return '';
	const cloud = cloudBase.getCloud();
	let buffer = null;
	try {
		const result = await cloud.downloadFile({ fileID });
		buffer = result && result.fileContent;
	} catch (err) {
		console.warn('cloud.downloadFile failed, fallback to temp URL:', err.message);
	}

	if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
		const tempURL = await getTempFileURLOne(fileID);
		if (!/^https:\/\//i.test(tempURL))
			throw new Error('CLOUD_IMAGE_DOWNLOAD_FAILED');
		buffer = await downloadHttpsBuffer(tempURL, maxBytes);
	}
	if (!Buffer.isBuffer(buffer) || buffer.length === 0)
		throw new Error('CLOUD_IMAGE_DOWNLOAD_FAILED');
	if (buffer.length > maxBytes)
		throw new Error('CLOUD_IMAGE_TOO_LARGE');

	let mime = 'image/jpeg';
	if (buffer.length >= 8 && buffer.slice(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
		mime = 'image/png';
	else if (buffer.length >= 6 && /^GIF8[79]a$/.test(buffer.slice(0, 6).toString('ascii')))
		mime = 'image/gif';
	else if (
		buffer.length >= 12 &&
		buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
		buffer.slice(8, 12).toString('ascii') === 'WEBP'
	)
		mime = 'image/webp';
	else if (buffer.length >= 2 && buffer.slice(0, 2).toString('ascii') === 'BM')
		mime = 'image/bmp';
	else if (!(buffer[0] === 0xFF && buffer[1] === 0xD8))
		throw new Error('CLOUD_IMAGE_FORMAT_UNSUPPORTED');

	return `data:${mime};base64,${buffer.toString('base64')}`;
}

function downloadHttpsBuffer(url, maxBytes, redirectCount = 0) {
	return new Promise((resolve, reject) => {
		if (redirectCount > 3)
			return reject(new Error('CLOUD_IMAGE_REDIRECT_LIMIT'));
		const req = https.get(url, { timeout: 20000 }, res => {
			if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
				res.resume();
				const nextURL = new URL(res.headers.location, url).toString();
				return downloadHttpsBuffer(nextURL, maxBytes, redirectCount + 1)
					.then(resolve, reject);
			}
			if (res.statusCode < 200 || res.statusCode >= 300) {
				res.resume();
				return reject(new Error(`CLOUD_IMAGE_HTTP_${res.statusCode}`));
			}
			const chunks = [];
			let size = 0;
			res.on('data', chunk => {
				size += chunk.length;
				if (size > maxBytes) {
					req.destroy(new Error('CLOUD_IMAGE_TOO_LARGE'));
					return;
				}
				chunks.push(chunk);
			});
			res.on('end', () => resolve(Buffer.concat(chunks)));
		});
		req.on('timeout', () => req.destroy(new Error('CLOUD_IMAGE_DOWNLOAD_TIMEOUT')));
		req.on('error', reject);
	});
}

async function handlerCloudFilesForForms(oldForms, newsForms) {
	let oldFiles = [];
	let newFiles = [];

	for (let k = 0; k < oldForms.length; k++) {
		if (oldForms[k].type == 'image')
			oldFiles = oldFiles.concat(oldForms[k].val);
		else if (oldForms[k].type == 'content') {
			let contentVal = oldForms[k].val;
			for (let n in contentVal) {
				if (contentVal[n].type == 'img')
					oldFiles.push(contentVal[n].val);
			}
		}
		else if (oldForms[k].type == 'file') {
			let fileVal = oldForms[k].val;
			for (let n in fileVal) {
				oldFiles.push(fileVal[n].path);
			}
		}
	}

	for (let j in newsForms) {
		if (newsForms[j].type == 'image')
			newFiles = newFiles.concat(newsForms[j].val);
		else if (newsForms[j].type == 'content') {
			let contentVal = newsForms[j].val;
			for (let m in contentVal) {
				if (contentVal[m].type == 'img')
					newFiles.push(contentVal[m].val);
			}
		}
		else if (newsForms[j].type == 'file') {
			let fileVal = newsForms[j].val;
			for (let m in fileVal) {
				newFiles.push(fileVal[m].path);
			}
		}
	}

	await handlerCloudFiles(oldFiles, newFiles);
}

async function handlerCloudFiles(oldFiles, newFiles) {
	//if (oldFiles.length == 0 && newFiles.length == 0) return [];

	const cloud = cloudBase.getCloud();
	for (let i = 0; i < oldFiles.length; i++) {
		let isDel = true;
		for (let j = 0; j < newFiles.length; j++) {
			if (oldFiles[i] == newFiles[j]) {
				// 从旧文件数组里 找到 新组 还存在的文件 ，则不删除
				isDel = false;
				break;
			}
		}
		// 新组里不存在，直接删除
		if (isDel && oldFiles[i]) {
			let result = await cloud.deleteFile({
				fileList: [oldFiles[i]],
			});
			console.log(result);
		}

	}

	return newFiles;
}


async function handlerCloudFilesByRichEditor(oldFiles, newFiles) {
	const cloud = cloudBase.getCloud();
	for (let i = 0; i < oldFiles.length; i++) {
		let isDel = true;
		for (let j = 0; j < newFiles.length; j++) {
			if (oldFiles[i].type == 'img' && newFiles[j].type == 'img' && oldFiles[i].val == newFiles[j].val) {
				// 从旧文件数组里 找到 新组 还存在的图片文件, 保存cloudID
				//newFiles[j].cloudId = oldFiles[i].cloudId;
				isDel = false;
				break;
			}
		}
		// 新组里不存在，直接删除
		if (isDel && oldFiles[i].type == 'img' && oldFiles[i].val) {

			let result = await cloud.deleteFile({
				fileList: [oldFiles[i].val],
			});
		}

	}

	return newFiles;
}

async function deleteFiles(list) {
	if (!list) return;
	if (!Array.isArray(list)) list = [list];
	if (list.length == 0) return;

	const cloud = cloudBase.getCloud();
	await cloud.deleteFile({
		fileList: list,
	});
}

// 延时执行，单位秒
async function delayTask(data, delayTime = 60 * 6, functionName = 'mcloud') {
	const cloud = cloudBase.getCloud();

	try {
		data = JSON.stringify(data);
		const result = await cloud.openapi.cloudbase.addDelayedFunctionTask({
			env: config.CLOUD_ID,
			data,
			functionName,
			delayTime
		})
		console.log(result, data);
	} catch (err) {
		console.error(err)
	}
}

module.exports = {
	log,
	getTempFileURL,
	getTempFileURLOne,
	getFileDataURL,
	deleteFiles,
	handlerCloudFiles,
	handlerCloudFilesByRichEditor,
	handlerCloudFilesForForms,
	delayTask
}
