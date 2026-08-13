const nutritionUtil = require('../utils/nutrition_util.js');

const FOOD_LIBRARY = {
	'多层皇堡': { amount: 350, carbs: 21.4, protein: 12.9, fat: 20 },
	'汉堡': { amount: 250, carbs: 19.2, protein: 10, fat: 11.2 },
	'中杯可乐': { amount: 330, carbs: 18.9, protein: 0, fat: 0 },
	'可乐': { amount: 330, carbs: 18.9, protein: 0, fat: 0 },
	'薯条': { amount: 120, carbs: 40, protein: 4.2, fat: 14.2 },
	'米饭': { amount: 150, carbs: 25.9, protein: 2.6, fat: 0.3 },
	'白米饭': { amount: 150, carbs: 25.9, protein: 2.6, fat: 0.3 },
	'鸡胸肉': { amount: 120, carbs: 0, protein: 31, fat: 3.6 },
	'鸡蛋': { amount: 50, carbs: 1.1, protein: 12.6, fat: 10.6 },
	'牛奶': { amount: 250, carbs: 4.8, protein: 3.2, fat: 3.6 },
	'面包': { amount: 60, carbs: 49, protein: 9, fat: 3.2 },
	'燕麦': { amount: 50, carbs: 66, protein: 15, fat: 7 },
	'香蕉': { amount: 100, carbs: 22.8, protein: 1.1, fat: 0.3 },
	'酸奶': { amount: 200, carbs: 12, protein: 3.5, fat: 3.2 },
	'西兰花': { amount: 100, carbs: 6.6, protein: 2.8, fat: 0.4 },
	'烧鸭': { amount: 150, carbs: 3, protein: 19, fat: 28 },
	'叉烧': { amount: 100, carbs: 10, protein: 23, fat: 18 },
	'豆角': { amount: 100, carbs: 7, protein: 2.5, fat: 0.3 },
	'青菜': { amount: 100, carbs: 3.5, protein: 1.8, fat: 0.3 },
	'辣椒酱': { amount: 15, carbs: 12, protein: 2, fat: 3 },
};

function normalizeGoal(profile = {}) {
	const source = profile.userProfile || profile;
	const goal = String(source.goal || '').toLowerCase();
	if (goal.includes('muscle') || goal.includes('增肌')) return 'muscle_gain';
	if (goal.includes('fat') || goal.includes('减脂')) return 'fat_loss';
	return 'body_shaping';
}

function explicitNoWrite(message) {
	return /(不用|不要|无需|别).{0,4}(记录|写入|保存)|只.{0,4}(分析|看看|建议)/.test(
		String(message || '')
	);
}

function detectIntent(message, hasImages) {
	const text = String(message || '');
	if (explicitNoWrite(text)) return '';
	if (/(训练计划|安排.{0,4}训练|今天.{0,3}(练|训练)|练什么|居家.{0,4}训练|哑铃训练|加入.{0,4}训练|写入.{0,4}训练|背部训练|胸部训练|腿部训练|腿部训练计划)/.test(text)) {
		return 'workout_plan';
	}
	if (
		hasImages ||
		/(我.{0,8}(吃了|喝了)|早餐|午餐|晚餐|加餐|这顿饭|食物|饮食计划|高蛋白饮食|识别.{0,4}(餐|图)|多少热量|记到.{0,4}(餐|饮食)|记录.{0,4}饮食)/.test(text)
	) {
		return 'food_log';
	}
	return '';
}

function mealType(text) {
	if (/早餐|早饭/.test(text)) return 'breakfast';
	if (/午餐|午饭/.test(text)) return 'lunch';
	if (/晚餐|晚饭/.test(text)) return 'dinner';
	if (/加餐|夜宵/.test(text)) return 'snack';
	return '';
}

function cleanFoodName(value) {
	return String(value || '')
		.replace(/^(?:大碗|一碗|一杯|一个|两个|两片|约|大份|小份)/, '')
		.replace(/带皮|去皮|熟重|生重/g, '')
		.trim();
}

function findKnownFood(name) {
	const normalized = cleanFoodName(name);
	if (!normalized || normalized.length < 2) return null;
	const key = Object.keys(FOOD_LIBRARY)
		.sort((left, right) => right.length - left.length)
		.find(item => normalized === item || normalized.includes(item) || (
			normalized.length >= 3 && item.includes(normalized)
		));
	return key ? { key, config: FOOD_LIBRARY[key] } : null;
}

function extractFoods(content, message) {
	const text = `${content || ''}\n${message || ''}`;
	const found = [];
	const seen = new Set();
	const amountPattern = /([\u3400-\u9fffA-Za-z]{1,12})[（(]?(?:约)?(\d+(?:\.\d+)?)\s*(g|克|ml|毫升|个|杯|片|碗)?(?:[^）)]*)[）)]?/g;
	let match;
	while ((match = amountPattern.exec(text))) {
		const name = cleanFoodName(match[1]);
		const known = findKnownFood(name);
		if (!known || seen.has(known.key)) continue;
		seen.add(known.key);
		found.push({ name: known.key, amount: Number(match[2]), unit: match[3] || 'g' });
	}
	for (const key of Object.keys(FOOD_LIBRARY).sort((left, right) => right.length - left.length)) {
		if (!text.includes(key) || seen.has(key)) continue;
		if (key === '汉堡' && seen.has('多层皇堡')) continue;
		if (key === '可乐' && seen.has('中杯可乐')) continue;
		const canonicalKey = key === '米饭' && text.includes('白米饭') ? '白米饭' : key;
		if (seen.has(canonicalKey)) continue;
		seen.add(canonicalKey);
		found.push({
			name: canonicalKey,
			amount: FOOD_LIBRARY[canonicalKey].amount,
			unit: 'g',
		});
	}
	return found.slice(0, 8);
}

function buildFoodItems(content, message) {
	const foods = extractFoods(content, message);
	return foods.map(food => {
		const known = findKnownFood(food.name);
		const config = known ? known.config : { carbs: 15, protein: 8, fat: 5 };
		const amount = Math.max(1, Number(food.amount) || config.amount || 100);
		const factor = amount / 100;
		const carbs = Math.round(config.carbs * factor * 10) / 10;
		const protein = Math.round(config.protein * factor * 10) / 10;
		const fat = Math.round(config.fat * factor * 10) / 10;
		return {
			name: food.name,
			amount,
			unit: food.unit || 'g',
			calories: nutritionUtil.calculateCaloriesByMacros(carbs, protein, fat),
			carbs,
			protein,
			fat,
			confidence: 0.78,
		};
	});
}

function workoutExercises(goal, message) {
	const rest = goal === 'fat_loss' ? 40 : (goal === 'muscle_gain' ? 105 : 60);
	const make = (name, sets, reps, muscleGroups, instruction) => ({
		name,
		muscleGroups,
		instruction,
		sets: Array.from({ length: sets }, (_, index) => ({
			setIndex: index + 1,
			weight: '',
			reps: String(reps),
			restSeconds: rest,
			completed: false,
		})),
	});
	if (/腿|下肢/.test(message)) {
		return [
			make('杯式深蹲', 4, goal === 'muscle_gain' ? 10 : 15, ['股四头肌', '臀大肌'], '膝盖与脚尖同向'),
			make('哑铃罗马尼亚硬拉', 4, 10, ['腘绳肌', '臀大肌'], '髋部向后，背部中立'),
			make('保加利亚分腿蹲', 3, 10, ['股四头肌', '臀大肌'], '前脚全脚掌稳定'),
			make('臀桥', 4, 15, ['臀大肌', '核心'], '顶端收紧臀部'),
			make('站姿提踵', 3, 18, ['小腿'], '顶端停顿一秒'),
		];
	}
	if (/背/.test(message)) {
		return [
			make('哑铃俯身划船', 4, 10, ['背部', '肱二头肌'], '背部收紧，避免耸肩'),
			make('单臂哑铃划船', 3, 12, ['背阔肌'], '保持躯干稳定'),
			make('哑铃罗马尼亚硬拉', 4, 10, ['后链', '臀腿'], '髋部向后，背部中立'),
			make('俯卧反向飞鸟', 3, 15, ['上背', '后束'], '小重量控制动作'),
			make('平板支撑', 3, 40, ['核心'], '保持身体一条直线'),
		];
	}
	if (/胸/.test(message)) {
		return [
			make('哑铃卧推', 4, 10, ['胸部', '肱三头肌'], '肩胛稳定，下放受控'),
			make('上斜哑铃卧推', 3, 10, ['上胸'], '避免耸肩'),
			make('哑铃飞鸟', 3, 12, ['胸部'], '肘部微屈'),
			make('俯卧撑', 3, 12, ['胸部', '核心'], '身体保持直线'),
			make('窄距俯卧撑', 3, 10, ['肱三头肌'], '肘部贴近身体'),
		];
	}
	if (goal === 'fat_loss') {
		return [
			make('开合跳', 3, 40, ['全身'], '轻落地，保持节奏'),
			make('徒手深蹲', 4, 15, ['臀腿'], '膝盖与脚尖同向'),
			make('俯卧撑', 3, 10, ['胸部', '核心'], '核心收紧'),
			make('登山跑', 4, 30, ['核心', '全身'], '保持髋部稳定'),
			make('波比跳', 3, 8, ['全身'], '按体能调整速度'),
		];
	}
	if (goal === 'muscle_gain') {
		return [
			make('哑铃卧推', 4, 10, ['胸部', '肱三头肌'], '下放受控'),
			make('单臂哑铃划船', 4, 10, ['背部', '肱二头肌'], '顶端夹背'),
			make('杯式深蹲', 4, 10, ['臀腿'], '保持躯干稳定'),
			make('哑铃肩推', 3, 10, ['肩部'], '避免腰部过伸'),
			make('哑铃罗马尼亚硬拉', 4, 10, ['后链'], '感受腘绳肌拉伸'),
		];
	}
	return [
		make('杯式深蹲', 3, 15, ['臀腿'], '保持膝髋稳定'),
		make('死虫式', 3, 12, ['核心'], '腰背贴地'),
		make('臀桥', 4, 15, ['臀部'], '顶端夹紧臀部'),
		make('跪姿俯卧撑', 3, 12, ['胸部', '核心'], '身体保持直线'),
		make('侧平板支撑', 3, 30, ['核心'], '避免塌髋'),
	];
}

function sumFoods(items) {
	return items.reduce((sum, item) => ({
		calories: sum.calories + item.calories,
		carbs: Math.round((sum.carbs + item.carbs) * 10) / 10,
		protein: Math.round((sum.protein + item.protein) * 10) / 10,
		fat: Math.round((sum.fat + item.fat) * 10) / 10,
	}), { calories: 0, carbs: 0, protein: 0, fat: 0 });
}

function normalizeBodyMetrics(source = {}) {
	const input = source && typeof source === 'object' ? source : {};
	const normalized = {};
	const pickNumber = value => {
		const number = Number(value);
		return Number.isFinite(number) ? Math.round(number * 10) / 10 : null;
	};
	const fieldMap = {
		weight: ['weight', 'currentWeight'],
		height: ['height'],
		targetWeight: ['targetWeight'],
		bmi: ['bmi'],
		bodyFatRate: ['bodyFatRate', 'bodyFat'],
		muscleMass: ['muscleMass'],
		deviceBmr: ['deviceBmr', 'bmr'],
		visceralFatLevel: ['visceralFatLevel', 'visceralFat'],
		waist: ['waist'],
		hip: ['hip'],
		chest: ['chest']
	};
	Object.keys(fieldMap).forEach(key => {
		const valueKey = fieldMap[key].find(name => input[name] !== undefined);
		if (!valueKey) return;
		const parsed = pickNumber(String(input[valueKey]).replace(/[^\d.-]/g, ''));
		if (parsed !== null) normalized[key] = parsed;
	});
	return normalized;
}

function parseBodyMetricsText(text) {
	const source = String(text || '');
	const patterns = {
		weight: /(?:当前)?体重\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
		height: /身高\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
		targetWeight: /目标体重\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
		bmi: /\bBMI\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
		bodyFatRate: /体脂(?:率)?\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
		muscleMass: /肌肉量\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
		deviceBmr: /(?:基础代谢|BMR)\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
		visceralFatLevel: /内脏脂肪(?:等级)?\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
		waist: /腰围\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
		hip: /臀围\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
		chest: /胸围\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
	};
	const parsed = {};
	Object.keys(patterns).forEach(key => {
		const match = source.match(patterns[key]);
		if (!match) return;
		parsed[key] = match[1];
	});
	return normalizeBodyMetrics(parsed);
}

function hasUsableProposal(proposals) {
	return (Array.isArray(proposals) ? proposals : []).some(proposal => {
		const data = proposal && proposal.payload || {};
		if (proposal.type === 'dietLog') return Array.isArray(data.items) && data.items.length > 0;
		if (proposal.type === 'workoutPlan') {
			return Array.isArray(data.exercises) && data.exercises.length > 0;
		}
		return proposal.type === 'profilePatch' &&
			data.profilePatch &&
			typeof data.profilePatch === 'object' &&
			Object.keys(data.profilePatch).length > 0;
	});
}

function ensureStructuredAnswer(answer, input = {}) {
	const value = Object.assign({}, answer || {});
	const payload = value.payload && typeof value.payload === 'object' ? value.payload : {};
	const routedIntent = input.intent && typeof input.intent === 'object' ? input.intent : null;
	if (routedIntent && routedIntent.responseMode !== 'generate_proposal') {
		value.payload = Object.assign({}, payload, {
			proposals: [],
			intent: routedIntent,
		});
		return value;
	}
	const existing = Array.isArray(payload.proposals) ? payload.proposals.filter(Boolean) : [];
	const bodyMetrics = normalizeBodyMetrics(Object.assign(
		{},
		payload.profilePatch || {},
		value.memory && value.memory.profilePatch || {},
		parseBodyMetricsText(`${input.message || ''}\n${value.content || ''}`)
	));
	const bodyIntent = routedIntent && routedIntent.intent === 'body_data_recognition';
	if (!hasUsableProposal(existing) && bodyIntent && Object.keys(bodyMetrics).length) {
		value.type = 'profile';
		value.content = [
			'我已整理出可确认的身体数据草稿。',
			'请先核对数值，再决定是否保存到个人资料。'
		].join('\n');
		value.payload = Object.assign({}, payload, {
			proposals: [{
				id: `body-${input.clientMessageId || Date.now()}`,
				type: 'profilePatch',
				status: 'pending',
				summary: `识别出 ${Object.keys(bodyMetrics).length} 项身体数据`,
				payload: {
					profilePatch: bodyMetrics,
					sourceMessageId: String(input.clientMessageId || '')
				},
			}],
			intent: routedIntent || payload.intent || {}
		});
		return value;
	}
	const visibleFoodItems = buildFoodItems(value.content, input.message);
	const existingFoodProposal = existing.find(proposal => proposal && proposal.type === 'dietLog');
	if (existingFoodProposal && visibleFoodItems.length) {
		const totals = sumFoods(visibleFoodItems);
		const recognitionId = String(input.recognitionId || `recognition-${Date.now()}`);
		const sourceMessageId = String(input.clientMessageId || '');
		const recognition = {
			id: recognitionId,
			sourceMessageId,
			sourceImageIds: [],
			recognizedAt: new Date().toISOString(),
			foods: visibleFoodItems,
			totalCalories: totals.calories,
			totalCarbs: totals.carbs,
			totalProtein: totals.protein,
			totalFat: totals.fat,
			confidence: 0.78,
			explanation: String(value.content || ''),
		};
		value.type = 'diet';
		value.content = [
			`识别到：${visibleFoodItems.map(item => item.name).join('、')}。`,
			`按当前份量估算：${totals.calories} kcal，蛋白质 ${totals.protein}g，碳水 ${totals.carbs}g，脂肪 ${totals.fat}g。`,
			'已使用同一份识别结果生成下方饮食草稿，请选择餐次并确认是否写入。',
		].join('\n');
		value.payload = Object.assign({}, payload, totals, {
			recognition,
			proposals: [{
				id: `food-${recognitionId}`,
				type: 'dietLog',
				status: 'pending',
				summary: `识别到 ${visibleFoodItems.map(item => item.name).join('、')}`,
				payload: {
					date: existingFoodProposal.payload && existingFoodProposal.payload.date || '',
					meal: existingFoodProposal.payload && existingFoodProposal.payload.meal || mealType(
						`${input.message || ''}\n${value.content || ''}`
					),
					items: visibleFoodItems,
					recognition,
					sourceMessageId,
				},
			}],
		});
		return value;
	}
	if (hasUsableProposal(existing) || explicitNoWrite(input.message)) return value;
	const intent = detectIntent(
		`${input.message || ''}\n${value.content || ''}`,
		Boolean(input.images && input.images.length)
	);
	if (!intent) return value;
	if (intent === 'food_log') {
		let items = buildFoodItems(value.content, input.message);
		if (!items.length && /(饮食计划|高蛋白)/.test(`${input.message} ${value.content}`)) {
			items = buildFoodItems('鸡胸肉150g、白米饭150g、西兰花150g、牛奶250ml', '');
		}
		if (!items.length && input.images && input.images.length && nutritionUtil.hasMacroData(payload)) {
			const carbs = Math.max(0, Number(payload.carbs) || 0);
			const protein = Math.max(0, Number(payload.protein) || 0);
			const fat = Math.max(0, Number(payload.fat) || 0);
			items = [{
				name: '图片餐食（请编辑名称）',
				amount: 1,
				unit: '份',
				calories: nutritionUtil.calculateCaloriesByMacros(carbs, protein, fat),
				carbs,
				protein,
				fat,
				confidence: 0.6,
			}];
		}
		if (!items.length) {
			value.content = `${value.content}\n\n我还不能确定具体食物和份量，请补充食物名称或上传更清晰的照片。`;
			return value;
		}
		const totals = sumFoods(items);
		value.type = 'diet';
		value.payload = Object.assign({}, payload, totals, {
			proposals: [{
				id: `food-${input.recognitionId || Date.now()}`,
				type: 'dietLog',
				status: 'pending',
				summary: `识别到 ${items.map(item => item.name).join('、')}，请确认餐次后写入`,
				payload: {
					date: '',
					meal: mealType(`${input.message} ${value.content}`),
					items,
					sourceMessageId: String(input.clientMessageId || ''),
				},
			}],
		});
		value.content = `${value.content}\n\n已整理为饮食草稿，请在下方选择餐次并确认是否写入。`;
		return value;
	}
	const profile = input.profile || {};
	const goal = normalizeGoal(profile);
	const durationMatch = String(input.message || '').match(/(\d+)\s*分钟/);
	const duration = durationMatch ? Number(durationMatch[1]) : 30;
	const exercises = workoutExercises(goal, input.message);
	const weight = Number((profile.userProfile || profile).weight) || 65;
	const met = goal === 'fat_loss' ? 7 : (goal === 'muscle_gain' ? 5.5 : 4.5);
	const calories = Math.round(met * weight * duration / 60);
	const goalLabel = goal === 'fat_loss' ? '减脂' : (goal === 'muscle_gain' ? '增肌' : '塑形');
	value.type = 'training';
	value.content = [
		`已按你的${goalLabel}目标生成 ${duration} 分钟训练：`,
		...exercises.map((item, index) => (
			`${index + 1}. ${item.name}：${item.sets.length} 组 × ${item.sets[0].reps}，组间休息 ${item.sets[0].restSeconds} 秒。`
		)),
		`预计消耗约 ${calories} kcal。请在下方确认是否写入训练计划。`,
	].join('\n');
	value.payload = Object.assign({}, payload, {
		days: [{
			name: '今日训练',
			actions: exercises.map(item => `${item.name} ${item.sets.length}组×${item.sets[0].reps}`),
		}],
		proposals: [{
			id: `workout-${Date.now()}`,
			type: 'workoutPlan',
			status: 'pending',
			summary: `${goalLabel}训练 · ${duration} 分钟 · 约 ${calories} kcal`,
			payload: {
				date: '',
				planName: `${goalLabel}训练计划`,
				goal,
				estimatedDurationMinutes: duration,
				estimatedCaloriesBurned: calories,
				targetMuscleGroups: Array.from(new Set(exercises.flatMap(item => item.muscleGroups))),
				exercises,
			},
		}],
	});
	return value;
}

module.exports = {
	detectIntent,
	ensureStructuredAnswer,
	buildFoodItems,
	workoutExercises,
};
