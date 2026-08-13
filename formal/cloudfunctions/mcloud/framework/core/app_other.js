/**
 * Notes: 云函数非标业务处理
 */

function handlerOther(event) {
	let isOther = false;

	if (!event) return {
		isOther,
		eventX
	};

	// 公众号事件处理
	if (event['FromUserName'] && event['MsgType']) {
		console.log('公众号事件处理');
		let ret = {
			route: 'oa/serve',
			params: event
		}
		return {
			isOther: true,
			eventX: ret
		};
	}

	return {
		isOther,
		eventX: event
	};
}


module.exports = {
	handlerOther,
}