const BaseProjectService = require('./base_project_service.js');
const AiSessionModel = require('../model/ai_session_model.js');
const AiMessageModel = require('../model/ai_message_model.js');
const AiResultModel = require('../model/ai_result_model.js');
const AiProfileModel = require('../model/ai_profile_model.js');
const AiLogModel = require('../model/ai_log_model.js');
const AiAgentAdapter = require('./ai_agent_adapter.js');
const AgentOrchestrator = require('../../../fitness-agent-harness/runtime/orchestrator/agent_orchestrator.js');
const MiniProgramHarnessAdapter = require('../../../fitness-agent-harness/runtime/parser/miniprogram_adapter.js');
const timeUtil = require('../../../framework/utils/time_util.js');
const cloudUtil = require('../../../framework/cloud/cloud_util.js');
const config = require('../../../config/config.js');

class AiService extends BaseProjectService {
	async getStatus() {
		return {
			configured: Boolean(config.MIMO_API_KEY),
			provider: 'Xiaomi MiMo',
			model: config.MIMO_MODEL,
			fastModel: config.MIMO_FAST_MODEL,
			endpoint: config.MIMO_BASE_URL.replace(/^https?:\/\//i, ''),
			keyType: config.MIMO_API_KEY ? config.MIMO_API_KEY.slice(0, 3) : '',
			mockEnabled: false,
		};
	}

	async probe() {
		try {
			return await new AiAgentAdapter().probe();
		} catch (err) {
			this.AppError(this._providerErrorMessage(err));
		}
	}

	async estimateCalories(food) {
		let result;
		try {
			result = await new AiAgentAdapter().estimateCalories(food);
		} catch (err) {
			this.AppError(this._providerErrorMessage(err));
		}
		if (!result || !result.calories) {
			this.AppError('暂时无法估算该食物热量，请补充具体分量');
		}
		return result;
	}

	async sendMessage(userId, {
		sessionId,
		message,
		profile = {},
		images = [],
		imageUrls = [],
		imageData = [],
		clientMessageId = '',
		recognitionId = '',
		intent = {},
	}) {
		profile = this._sanitizeObject(profile);
		images = Array.isArray(images)
			? images.filter(item => typeof item === 'string' && item.length <= 500).slice(0, 3)
			: [];
		imageUrls = Array.isArray(imageUrls)
			? imageUrls
				.map(item => String(item || '').trim())
				.filter(item => /^https:\/\//i.test(item) && item.length <= 3000)
				.slice(0, 3)
			: [];
		imageData = Array.isArray(imageData)
			? imageData
				.map(item => String(item || '').trim())
				.filter(item => /^data:image\/(?:jpeg|png|gif|webp|bmp);base64,/i.test(item))
				.slice(0, 3)
			: [];
		const storedProfile = await this._getProfile(userId);
		const effectiveProfile = Object.assign({}, storedProfile, profile);
		let session = null;
		if (sessionId) {
			session = await AiSessionModel.getOne({
				AI_SESSION_ID: sessionId,
				AI_SESSION_USER_ID: userId,
			});
		}

		if (!session) {
			const id = await AiSessionModel.insert({
				AI_SESSION_USER_ID: userId,
				AI_SESSION_TITLE: message.slice(0, 24),
				AI_SESSION_CONTEXT: effectiveProfile,
			});
			session = await AiSessionModel.getOne(id);
			sessionId = session.AI_SESSION_ID;
		}

		const history = await AiMessageModel.getAll({
			AI_MESSAGE_USER_ID: userId,
			AI_MESSAGE_SESSION_ID: sessionId,
		}, 'AI_MESSAGE_ROLE,AI_MESSAGE_CONTENT,AI_MESSAGE_TYPE,AI_MESSAGE_PAYLOAD', { AI_MESSAGE_ADD_TIME: 'desc' }, 6);
		const recentLogs = await AiLogModel.getAll(
			{ AI_LOG_USER_ID: userId },
			'AI_LOG_TYPE,AI_LOG_DATE,AI_LOG_DATA',
			{ AI_LOG_ADD_TIME: 'desc' },
			10
		);
		const durableMemory = recentLogs
			.filter(item => item.AI_LOG_TYPE === 'observation')
			.slice(0, 8);

		let resolvedImages = [];
		try {
			resolvedImages = imageData.length
				? imageData
				: (imageUrls.length === images.length
					? imageUrls
					: await this._resolveImageInputs(images));
		} catch (err) {
			this.AppError(this._imageErrorMessage(err));
		}
		if (images.length && resolvedImages.length !== images.length) {
			this.AppError('部分图片无法转换为 MiMo 可读取的格式');
		}

		const resolvedHistory = [];
		for (const item of history.reverse()) {
			resolvedHistory.push(Object.assign({}, item, {
				// Model routing is based only on images attached to this request.
				// Historical images remain visible in chat but are never resent implicitly.
				resolvedImages: [],
			}));
		}

		// ===== M6: Python agent-service 切流 (灰度) =====
		// AGENT_USE_PYTHON=on|gray 时优先转发到 Python agent-service;
		// 失败自动回退下方 Node harness (零中断回滚).
		const AgentServiceClient = require("./agent_service_client.js");
		let pythonAnswer = null;
		if (AgentServiceClient.shouldUsePythonAgent(userId)) {
			try {
				const pyResp = await AgentServiceClient.forwardTurn({
					userId,
					sessionId,
					message,
					images: resolvedImages,
					imageData: resolvedImages,
					profile: Object.assign({}, effectiveProfile, session.AI_SESSION_CONTEXT || {}),
					history: resolvedHistory,
					recentLogs,
					previousState: session.AI_SESSION_CONTEXT && session.AI_SESSION_CONTEXT.agentHarnessState,
					clientMessageId,
				});
				if (pyResp && pyResp.ok && pyResp.answer) {
					pythonAnswer = pyResp.answer;
					pythonAnswer.payload = this._ensureProposalIds(pythonAnswer.payload, sessionId);
					pythonAnswer.payload = pythonAnswer.payload || {};
					pythonAnswer.payload.agentTrace = pyResp.trace || [];
					pythonAnswer.payload.agentDriver = "python";
				} else {
					this.AppError(`Python agent 失败，回退 Node: ${String(pyResp && pyResp.error || "").slice(0, 120)}`);
				}
			} catch (err) {
				this.AppError(`Python agent 异常，回退 Node: ${String(err && err.message || err).slice(0, 120)}`);
			}
		}

		// Python 成功 -> 用 Python answer; 否则走 Node harness + MiMo
		let answer;
		let harnessTurn = null;
		if (pythonAnswer) {
			answer = pythonAnswer;
		} else {
			const harness = new AgentOrchestrator({
				toolHandlers: this._buildHarnessToolHandlers(userId, sessionId),
				llmCaller: this._buildIntentLLMCaller(),
			});
			try {
				harnessTurn = await harness.runTurn({
					userId,
					sessionId,
					message,
					images: resolvedImages,
					imageData: resolvedImages,
					profile: Object.assign({}, effectiveProfile, session.AI_SESSION_CONTEXT || {}),
					history: resolvedHistory,
					recentLogs,
					previousState: session.AI_SESSION_CONTEXT && session.AI_SESSION_CONTEXT.agentHarnessState,
				});
			} catch (err) {
				this.AppError(`Agent Harness 运行失败：${String(err && err.message || err).slice(0, 160)}`);
			}

			const agent = new AiAgentAdapter();
			if (MiniProgramHarnessAdapter.shouldShortCircuit(harnessTurn)) {
				answer = MiniProgramHarnessAdapter.toMiniProgramAnswer(harnessTurn);
			} else {
				try {
					answer = await agent.chat({
						userId,
						sessionId,
						message,
						images: resolvedImages,
						profile: Object.assign({}, effectiveProfile, session.AI_SESSION_CONTEXT || {}),
						history: resolvedHistory,
						recentLogs: recentLogs.filter(item => item.AI_LOG_TYPE !== 'observation').slice(0, 6),
						memory: durableMemory,
						clientMessageId,
						recognitionId,
						intent: this._sanitizeObject(intent),
					});
					answer = MiniProgramHarnessAdapter.mergeModelAnswer(answer, harnessTurn);
				} catch (err) {
					this.AppError(this._providerErrorMessage(err));
				}
			}
		}

		answer.payload = this._ensureProposalIds(answer.payload, sessionId);
		const type = answer.type === 'diet' ? 'diet' : (answer.type === 'training' ? 'training' : 'general');
		const userMessageTask = AiMessageModel.insert({
			AI_MESSAGE_USER_ID: userId,
			AI_MESSAGE_SESSION_ID: sessionId,
			AI_MESSAGE_ROLE: 'user',
			AI_MESSAGE_CONTENT: message,
			AI_MESSAGE_PAYLOAD: { images },
		});
		const assistantMessageTask = AiMessageModel.insert({
			AI_MESSAGE_USER_ID: userId,
			AI_MESSAGE_SESSION_ID: sessionId,
			AI_MESSAGE_ROLE: 'assistant',
			AI_MESSAGE_TYPE: type,
			AI_MESSAGE_CONTENT: answer.content || '',
			AI_MESSAGE_PAYLOAD: Object.assign({}, answer.payload || {}, {
				memory: answer.memory || {},
				safety: answer.safety || {},
				model: answer.model || '',
				requestId: answer.requestId || '',
			}),
		});

		const resultTask = type !== 'general'
			? AiResultModel.insert({
				AI_RESULT_USER_ID: userId,
				AI_RESULT_SESSION_ID: sessionId,
				AI_RESULT_TYPE: type,
				AI_RESULT_TITLE: answer.title || (type === 'diet' ? '饮食测算' : '训练计划'),
				AI_RESULT_SUMMARY: answer.content || '',
				AI_RESULT_PAYLOAD: answer.payload || {},
			})
			: Promise.resolve('');

		const priorProposalIds = Array.isArray(session.AI_SESSION_CONTEXT && session.AI_SESSION_CONTEXT.confirmedProposalIds)
			? session.AI_SESSION_CONTEXT.confirmedProposalIds
			: [];
		const confirmedProposals = this._confirmedProposals(answer.payload)
			.filter(item => !priorProposalIds.includes(item.id));
		const confirmedProposalIds = priorProposalIds
			.concat(confirmedProposals.map(item => item.id))
			.slice(-100);
		if (confirmedProposals.length) {
			await this._persistConfirmedProposals(userId, sessionId, confirmedProposals);
		}
		const agentState = this._buildAgentState({
			intent,
			answer,
			message,
			clientMessageId,
			recognitionId,
			hasImages: resolvedImages.length > 0,
		});
		answer.payload = Object.assign({}, answer.payload || {}, {
			agentState,
		});
		const sessionTask = AiSessionModel.edit(session._id, {
			AI_SESSION_TYPE: type,
			AI_SESSION_CONTEXT: Object.assign(
				{},
				session.AI_SESSION_CONTEXT || {},
				profile,
				{
					confirmedProposalIds,
					agentState,
					agentHarnessState: harnessTurn && harnessTurn.state || null,
				}
			),
		});
		const [, , resultId] = await Promise.all([
			userMessageTask,
			assistantMessageTask,
			resultTask,
			sessionTask,
		]);

		return {
			sessionId,
			resultId,
			answer: {
				type,
				title: answer.title,
				content: answer.content,
				payload: answer.payload,
				memory: answer.memory || {},
				safety: answer.safety,
				model: answer.model,
				requestId: answer.requestId,
			},
		};
	}

	/**
	 * [方案A] 构造 LLM intent fallback caller.
	 * 规则识别无把握时, 调 MiMo fast 做轻量意图分类.
	 * 签名: async (systemPrompt, userPrompt) => string
	 */
	_buildIntentLLMCaller() {
		if (!config.MIMO_API_KEY) return null;
		return async (systemPrompt, userPrompt) => {
			const AiAgentAdapter = require('./ai_agent_adapter.js');
			const adapter = new AiAgentAdapter();
			const data = await adapter._postJson(config.MIMO_BASE_URL, {
				model: config.MIMO_FAST_MODEL,
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userPrompt }
				],
				stream: false,
				max_completion_tokens: 100,
				temperature: 0
			});
			const choice = data && data.choices && data.choices[0];
			return choice && choice.message ? choice.message.content : '';
		};
	}

	_buildHarnessToolHandlers(userId, sessionId) {
		const queryLogs = async (type, date, limit) => {
			const where = { AI_LOG_USER_ID: userId, AI_LOG_TYPE: type };
			if (date) where.AI_LOG_DATE = String(date).slice(0, 10);
			const rows = await AiLogModel.getAll(
				where,
				'AI_LOG_ID,AI_LOG_TYPE,AI_LOG_DATE,AI_LOG_DATA,AI_LOG_ADD_TIME',
				{ AI_LOG_ADD_TIME: 'desc' },
				Number(limit) || 20
			);
			return rows.map(item => Object.assign({}, item.AI_LOG_DATA || {}, {
				id: item.AI_LOG_ID,
				date: item.AI_LOG_DATE,
			})).reverse();
		};
		return {
			'user.profile.get': async () => ({
				ok: true,
				data: { profile: await this._getProfile(userId) },
			}),
			'user.profile.update': async input => {
				const profilePatch = this._sanitizeObject(input && input.profilePatch);
				await this._persistAgentMemory(userId, sessionId, { profilePatch });
				return {
					ok: true,
					data: { profile: await this._getProfile(userId) },
				};
			},
			'diet.log.create': async input => {
				const data = this._sanitizeObject(Object.assign({}, input, { userId }));
				await this._insertLog(userId, sessionId, 'diet', data);
				return { ok: true, data: { logId: `${sessionId}-diet-${Date.now()}`, record: data } };
			},
			'diet.log.query': async input => ({
				ok: true,
				data: { list: await queryLogs('diet', input && input.date, input && input.limit) },
			}),
			'training.plan.create': async input => {
				const data = this._sanitizeObject(Object.assign({}, input && input.plan || input, { userId }));
				await this._insertLog(userId, sessionId, 'exercise', data);
				return { ok: true, data: { planId: `${sessionId}-plan-${Date.now()}`, plan: data } };
			},
			'training.plan.get': async input => ({
				ok: true,
				data: { list: await queryLogs('exercise', input && input.date, input && input.limit) },
			}),
			'training.plan.update': async input => {
				const data = this._sanitizeObject(Object.assign({}, input && input.patch || input, {
					userId,
					date: input && input.date || timeUtil.time('Y-M-D'),
					operation: 'update',
				}));
				await this._insertLog(userId, sessionId, 'exercise', data);
				return { ok: true, data: { planId: `${sessionId}-plan-${Date.now()}`, plan: data } };
			},
			'training.log.create': async input => {
				const data = this._sanitizeObject(Object.assign({}, input, { userId, kind: 'training_log' }));
				await this._insertLog(userId, sessionId, 'exercise', data);
				return { ok: true, data: { logId: `${sessionId}-training-${Date.now()}`, record: data } };
			},
			'training.log.query': async input => ({
				ok: true,
				data: { list: await queryLogs('exercise', input && input.date, input && input.limit) },
			}),
			'body.metric.create': async input => {
				const data = this._sanitizeObject({
					userId,
					date: input && input.date || timeUtil.time('Y-M-D'),
					metrics: input && input.metrics || {},
					source: input && input.source || 'chat',
				});
				await this._insertLog(userId, sessionId, 'body', data);
				return { ok: true, data: { metricId: `${sessionId}-body-${Date.now()}`, record: data } };
			},
			'body.metric.query': async input => ({
				ok: true,
				data: { list: await queryLogs('body', '', input && input.limit) },
			}),
		};
	}

	_buildAgentState({ intent = {}, answer = {}, message = '', clientMessageId = '', recognitionId = '', hasImages = false }) {
		const proposals = Array.isArray(answer.payload && answer.payload.proposals)
			? answer.payload.proposals.filter(Boolean)
			: [];
		const pendingProposal = proposals.find(item => item.status !== 'cancelled') || null;
		const currentTask = {
			intent: String(intent.intent || 'general'),
			responseMode: String(intent.responseMode || ''),
			step: pendingProposal ? 'awaiting_confirmation' : 'answered',
			sourceMessageId: String(clientMessageId || ''),
		};
		const pendingConfirmation = pendingProposal
			? {
				id: String(pendingProposal.id || ''),
				type: String(pendingProposal.type || ''),
				message: this._pendingConfirmationMessage(pendingProposal),
				sourceMessageId: String(
					(pendingProposal.payload && pendingProposal.payload.sourceMessageId) ||
					clientMessageId ||
					''
				),
			}
			: null;
		const lastToolCall = {
			tool: this._deriveToolName(intent, hasImages),
			source: hasImages ? 'image' : 'text',
			recognitionId: String(recognitionId || ''),
			at: Date.now(),
		};
		return this._sanitizeObject({
			currentTask,
			pendingConfirmation,
			pendingWrite: pendingProposal ? {
				type: pendingProposal.type || '',
				proposalId: pendingProposal.id || '',
			} : null,
			lastToolCall,
			errorState: null,
			lastUserMessage: String(message || '').slice(0, 200),
		});
	}

	_pendingConfirmationMessage(proposal = {}) {
		const type = String(proposal.type || '');
		if (type === 'dietLog') return '请先确认这条饮食记录，再决定是否写入';
		if (type === 'workoutPlan') return '请先确认这份训练计划，再决定是否写入';
		if (type === 'profilePatch') return '请先核对身体数据，再决定是否写入';
		return '请先确认这条内容，再决定是否写入';
	}

	_deriveToolName(intent = {}, hasImages = false) {
		const name = String(intent.intent || '');
		if (name === 'body_data_recognition') return hasImages ? 'body_data_parse' : 'body_data_parse';
		if (name === 'food_log_write') return hasImages ? 'food_image_analyze' : 'food_text_parse';
		if (name === 'meal_plan_generation') return 'meal_plan_generate';
		if (name === 'workout_plan_generation' || name === 'workout_plan_adjustment') {
			return 'exercise_search';
		}
		if (name === 'calorie_gap_evaluation') return 'calculate_remaining_calories';
		if (name === 'body_status_evaluation') return 'health_summary_generate';
		return hasImages ? 'multimodal_analyze' : 'reasoning';
	}

	_ensureProposalIds(payload = {}, sessionId = '') {
		if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
		const proposals = Array.isArray(payload.proposals) ? payload.proposals : [];
		return Object.assign({}, payload, {
			proposals: proposals.map((item, index) => Object.assign({}, item, {
				id: String(item.id || `${sessionId}-${Date.now()}-${index}`).slice(0, 80),
			})),
		});
	}

	_confirmedProposals(payload = {}) {
		const proposals = payload && Array.isArray(payload.proposals) ? payload.proposals : [];
		return proposals.filter(item => item && item.status === 'confirmed').slice(0, 3);
	}

	async _persistConfirmedProposals(userId, sessionId, proposals) {
		for (const proposal of proposals) {
			const data = this._sanitizeObject(proposal.payload);
			if (proposal.type === 'profilePatch') {
				await this._persistAgentMemory(userId, sessionId, {
					profilePatch: this._sanitizeObject(data.profilePatch),
				});
			} else if (proposal.type === 'dietLog') {
				await this._insertLog(userId, sessionId, 'diet', data);
			} else if (proposal.type === 'workoutPlan') {
				await this._insertLog(userId, sessionId, 'exercise', data);
			}
		}
	}

	async _resolveImageInputs(images) {
		images = Array.isArray(images)
			? images.map(item => String(item || '').trim()).filter(Boolean).slice(0, 3)
			: [];
		if (!images.length) return [];
		const resolved = [];
		for (const image of images) {
			if (/^https:\/\//i.test(image) || /^data:image\//i.test(image)) {
				resolved.push(image);
			} else {
				resolved.push(await cloudUtil.getFileDataURL(image));
			}
		}
		return resolved;
	}

	async _getProfile(userId) {
		const profile = await AiProfileModel.getOne({ AI_PROFILE_USER_ID: userId });
		return profile ? profile.AI_PROFILE_DATA : {};
	}

	async _persistAgentMemory(userId, sessionId, memory = {}) {
		if (!memory || typeof memory !== 'object') return;

		const profilePatch = this._sanitizeObject(memory.profilePatch);
		if (Object.keys(profilePatch).length > 0) {
			const current = await AiProfileModel.getOne({ AI_PROFILE_USER_ID: userId });
			const data = Object.assign({}, current ? current.AI_PROFILE_DATA : {}, profilePatch);
			if (current) {
				await AiProfileModel.edit(current._id, { AI_PROFILE_DATA: data });
			} else {
				await AiProfileModel.insert({
					AI_PROFILE_USER_ID: userId,
					AI_PROFILE_DATA: data,
				});
			}
		}

		await this._insertLog(userId, sessionId, 'body', memory.bodyStats);
		await this._insertLog(userId, sessionId, 'exercise', memory.exerciseLog);
		await this._insertLog(userId, sessionId, 'diet', memory.dietLog);

		const observation = String(memory.observation || '').trim();
		if (observation) {
			await this._insertLog(userId, sessionId, 'observation', { text: observation });
		}
	}

	async _insertLog(userId, sessionId, type, data) {
		data = this._sanitizeObject(data);
		if (Object.keys(data).length === 0) return;
		await AiLogModel.insert({
			AI_LOG_USER_ID: userId,
			AI_LOG_SESSION_ID: sessionId,
			AI_LOG_TYPE: type,
			AI_LOG_DATE: String(data.date || timeUtil.time('Y-M-D')).slice(0, 10),
			AI_LOG_DATA: data,
		});
	}

	_sanitizeObject(data) {
		if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
		const clean = {};
		for (const key of Object.keys(data).slice(0, 40)) {
			if (key === '__proto__' || key === 'prototype' || key === 'constructor') continue;
			const value = data[key];
			if (value === null || value === undefined || value === '') continue;
			const safeKey = String(key).slice(0, 60);
			if (typeof value === 'string') {
				clean[safeKey] = value.slice(0, 1000);
			} else if (typeof value === 'number' || typeof value === 'boolean') {
				clean[safeKey] = value;
			} else if (Array.isArray(value)) {
				clean[safeKey] = value.slice(0, 50);
			} else if (typeof value === 'object') {
				const serialized = JSON.stringify(value);
				if (serialized.length <= 3000) clean[safeKey] = value;
			}
		}
		return clean;
	}

	_providerErrorMessage(err) {
		const code = String(err && err.providerCode || 'MIMO_UNKNOWN_ERROR');
		const detail = String(err && err.message || '').replace(/sk-[A-Za-z0-9_-]+/g, '***').slice(0, 180);
		const messages = {
			MIMO_NOT_CONFIGURED: 'MiMo 未读取到 MIMO_API_KEY，请检查 mcloud 环境变量并重新部署',
			MIMO_AUTH_FAILED: 'MiMo API Key 鉴权失败，请确认 Key 类型、内容及账户状态',
			MIMO_ENDPOINT_OR_MODEL_INVALID: 'MiMo 接口地址或模型名称无效',
			MIMO_RATE_LIMITED: 'MiMo 请求过于频繁或账户额度不足，请稍后重试',
			MIMO_TIMEOUT: 'MiMo 响应超时，请将 mcloud 云函数超时设置为 60 秒',
			MIMO_NETWORK_ERROR: 'mcloud 无法连接 MiMo API，请检查云函数外网访问',
			MIMO_UPSTREAM_ERROR: 'MiMo 服务暂时异常，请稍后重试',
			MIMO_INVALID_RESPONSE: 'MiMo 返回了无法解析的响应',
			MIMO_REQUEST_REJECTED: 'MiMo 拒绝了当前请求',
		};
		return `${messages[code] || 'MiMo 调用失败'} [${code}]${detail ? `：${detail}` : ''}`;
	}

	_imageErrorMessage(err) {
		const code = String(err && err.message || '');
		if (code.includes('TOO_LARGE')) return '图片压缩后仍然过大，请重新选择图片';
		if (code.includes('FORMAT_UNSUPPORTED')) return '暂不支持该图片格式，请使用 JPG、PNG、GIF、WebP 或 BMP';
		if (code.includes('DOWNLOAD_FAILED') || code.includes('DOWNLOAD_TIMEOUT') || code.includes('CLOUD_IMAGE_HTTP_'))
			return '无法从微信云存储读取图片，请重新选择后再试';
		if (code.includes('REFERENCE_INVALID')) return '图片地址无效，请重新上传';
		return '图片处理失败，请重新上传后再试';
	}

	async getMessages(userId, sessionId) {
		return await AiMessageModel.getAll({
			AI_MESSAGE_USER_ID: userId,
			AI_MESSAGE_SESSION_ID: sessionId,
		}, '*', { AI_MESSAGE_ADD_TIME: 'asc' }, 100);
	}

	async getSessions(userId) {
		return await AiSessionModel.getAll(
			{ AI_SESSION_USER_ID: userId, AI_SESSION_STATUS: 1 },
			'AI_SESSION_ID,AI_SESSION_TITLE,AI_SESSION_TYPE,AI_SESSION_EDIT_TIME',
			{ AI_SESSION_EDIT_TIME: 'desc' },
			30
		);
	}

	async deleteSession(userId, sessionId) {
		const session = await AiSessionModel.getOne({
			AI_SESSION_ID: sessionId,
			AI_SESSION_USER_ID: userId,
		});
		if (!session) this.AppError('未找到该历史对话');
		await AiSessionModel.edit(session._id, { AI_SESSION_STATUS: 0 });
		return true;
	}

	async getHomeResults(userId) {
		const list = await AiResultModel.getAll(
			{ AI_RESULT_USER_ID: userId, AI_RESULT_STATUS: 1 },
			'*',
			{ AI_RESULT_ADD_TIME: 'desc' },
			3
		);
		return { list };
	}

	async getProfile(userId) {
		return await this._getProfile(userId);
	}

	async getLogs(userId, type = '') {
		const where = { AI_LOG_USER_ID: userId };
		if (type) where.AI_LOG_TYPE = type;
		return await AiLogModel.getAll(
			where,
			'AI_LOG_TYPE,AI_LOG_DATE,AI_LOG_DATA,AI_LOG_ADD_TIME',
			{ AI_LOG_ADD_TIME: 'desc' },
			100
		);
	}

	async refreshResult(userId, resultId) {
		const result = await AiResultModel.getOne({
			AI_RESULT_ID: resultId,
			AI_RESULT_USER_ID: userId,
		});
		if (!result) this.AppError('未找到该 AI 结果');
		return await this.sendMessage(userId, {
			sessionId: result.AI_RESULT_SESSION_ID,
			message: result.AI_RESULT_TYPE === 'diet' ? '请根据上次内容重新测算并给出更简洁的建议' : '请根据上次内容刷新训练计划',
		});
	}
}

module.exports = AiService;
