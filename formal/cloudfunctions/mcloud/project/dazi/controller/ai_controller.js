const BaseProjectController = require('./base_project_controller.js');
const AiService = require('../service/ai_service.js');

class AiController extends BaseProjectController {
	async getStatus() {
		return await new AiService().getStatus();
	}

	async probe() {
		return await new AiService().probe();
	}

	async estimateCalories() {
		const input = this.validateData({
			food: 'must|string|min:1|max:120|name=食物描述',
		});
		return await new AiService().estimateCalories(input.food);
	}

	async sendMessage() {
		const input = this.validateData({
			sessionId: 'string|max:50',
			message: 'must|string|min:1|max:1000|name=问题',
			profile: 'object',
			images: 'array',
			imageUrls: 'array',
			imageData: 'array',
			clientMessageId: 'string|max:80',
			recognitionId: 'string|max:80',
			intent: 'object',
		});
		return await new AiService().sendMessage(this._userId, input);
	}

	async getMessages() {
		const input = this.validateData({ sessionId: 'must|string|max:50' });
		return await new AiService().getMessages(this._userId, input.sessionId);
	}

	async getSessions() {
		return await new AiService().getSessions(this._userId);
	}

	async deleteSession() {
		const input = this.validateData({ sessionId: 'must|string|max:50' });
		return await new AiService().deleteSession(this._userId, input.sessionId);
	}

	async getHomeResults() {
		return await new AiService().getHomeResults(this._userId);
	}

	async getProfile() {
		return await new AiService().getProfile(this._userId);
	}

	async getLogs() {
		const input = this.validateData({
			type: 'string|max:20',
		});
		return await new AiService().getLogs(this._userId, input.type);
	}

	async refreshResult() {
		const input = this.validateData({ resultId: 'must|string|max:50' });
		return await new AiService().refreshResult(this._userId, input.resultId);
	}
}

module.exports = AiController;
