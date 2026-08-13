// components/proposal-card/index.js
const MEAL_LABELS = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' };
const TYPE_LABELS = {
  dietLog: '饮食',
  workoutPlan: '训练',
  profilePatch: '身体数据'
};
const STATUS_LABELS = {
  pending: '待确认',
  confirmed: '已确认',
  cancelled: '已取消'
};

const PROFILE_FIELD_LABELS = {
  weight: '体重',
  targetWeight: '目标体重',
  height: '身高',
  bmi: 'BMI',
  bodyFatRate: '体脂率',
  muscleMass: '肌肉量',
  boneMass: '骨量',
  waterRate: '水分率',
  bmr: '基础代谢',
  visceralFatLevel: '内脏脂肪',
  bodyAge: '身体年龄',
  proteinRate: '蛋白质率',
  waist: '腰围',
  hip: '臀围',
  chest: '胸围',
  thigh: '大腿围',
  calf: '小腿围',
  upperArm: '上臂围',
  shoulder: '肩宽',
  deviceBmr: '设备 BMR',
  fatMass: '脂肪量',
  proteinMass: '肌肉量',
  muscleRate: '肌肉率',
  skeletalMuscleMass: '骨骼肌量',
  waistHipRatio: '腰臀比',
  leanBodyMass: '瘦体重',
  heartRate: '心率',
  standardWeight: '标准体重',
  weightControl: '体重控制',
  fatControl: '脂肪控制',
  bodyWaterMass: '水分量'
};
const PROFILE_FIELD_UNITS = {
  weight: 'kg', targetWeight: 'kg', height: 'cm', bmi: '', bodyFatRate: '%',
  muscleMass: 'kg', boneMass: 'kg', waterRate: '%', bmr: 'kcal', visceralFatLevel: '',
  bodyAge: '岁', proteinRate: '%', waist: 'cm', hip: 'cm', chest: 'cm',
  thigh: 'cm', calf: 'cm', upperArm: 'cm', shoulder: 'cm', deviceBmr: 'kcal',
  fatMass: 'kg', proteinMass: 'kg', muscleRate: '%', skeletalMuscleMass: 'kg',
  waistHipRatio: '', leanBodyMass: 'kg', heartRate: 'bpm', standardWeight: 'kg',
  weightControl: 'kg', fatControl: 'kg', bodyWaterMass: 'kg'
};

Component({
  properties: {
    proposal: {
      type: Object,
      value: {}
    }
  },

  data: {
    typeLabel: '',
    statusLabel: '',
    mealLabel: '',
    totalCalories: 0,
    totalProtein: 0,
    totalCarb: 0,
    totalFat: 0,
    profileFields: []
  },

  observers: {
    'proposal': function (proposal) {
      this._recompute(proposal || {});
    }
  },

  methods: {
    _recompute(proposal) {
      const payload = proposal.payload || {};
      const totals = (payload.items || []).reduce(
        (acc, item) => ({
          calories: acc.calories + Number(item.calories || 0),
          protein: acc.protein + Number(item.protein || 0),
          carb: acc.carb + Number(item.carbs || item.carb || 0),
          fat: acc.fat + Number(item.fat || 0)
        }),
        { calories: 0, protein: 0, carb: 0, fat: 0 }
      );

      let profileFields = [];
      if (proposal.type === 'profilePatch') {
        const patch = payload.profilePatch || {};
        profileFields = Object.keys(patch)
          .filter(k => patch[k] !== undefined && patch[k] !== '' && patch[k] !== null)
          .map(k => ({
            key: k,
            label: PROFILE_FIELD_LABELS[k] || k,
            value: patch[k],
            unit: PROFILE_FIELD_UNITS[k] || ''
          }));
      }

      this.setData({
        typeLabel: TYPE_LABELS[proposal.type] || '建议',
        statusLabel: STATUS_LABELS[proposal.status] || '',
        mealLabel: MEAL_LABELS[payload.meal] || '',
        totalCalories: totals.calories ? Math.round(totals.calories) : 0,
        totalProtein: Math.round(totals.protein),
        totalCarb: Math.round(totals.carb),
        totalFat: Math.round(totals.fat),
        profileFields
      });
    },

    onConfirm() {
      this.triggerEvent('confirm', { proposal: this.data.proposal });
    },

    onCancel() {
      this.triggerEvent('cancel', { proposal: this.data.proposal });
    },

    onEdit() {
      this.triggerEvent('edit', { proposal: this.data.proposal });
    }
  }
});