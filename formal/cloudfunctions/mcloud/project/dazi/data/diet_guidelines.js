// cloudfunctions/mcloud/project/dazi/data/diet_guidelines.js
// 数据来源：中国营养学会《中国居民膳食指南（2022）》（人民卫生出版社）
// 该常量库以"硬数值+权威来源标注"的方式注入 agent 上下文，
// 避免模型在 prompt 内自行编造推荐量。
//
// 使用方式：
//   const diet = require('../data/diet_guidelines.js');
//   diet.VEGETABLES_DAILY  // { min:300, max:500, unit:'g', source:'中国居民膳食指南2022' }

module.exports = {
  VERSION: '2022.1',
  LAST_UPDATED: '2024-12-01',
  SOURCE: '中国营养学会《中国居民膳食指南（2022）》',

  // ===== 食物推荐量 =====
  VEGETABLES_DAILY:    { min: 300,  max: 500,  unit: 'g',   label: '蔬菜' },
  FRUITS_DAILY:        { min: 200,  max: 350,  unit: 'g',   label: '新鲜水果' },
  WHOLE_GRAIN_BEAN_DAILY:{ min: 50, max: 150,  unit: 'g',   label: '全谷物和杂豆' },
  TUBER_DAILY:         { min: 50,   max: 100,  unit: 'g',   label: '薯类' },
  MILK_DAILY:          { min: 300,  max: 500,  unit: 'ml',  label: '奶及奶制品' },
  SOY_DAILY:           { min: 25,   max: 35,   unit: 'g',   label: '大豆及坚果' },
  MEAT_POULTRY_FISH_EGG_DAILY:{ min: 120, max: 200, unit:'g', label: '鱼禽肉蛋' },
  WATER_DAILY:         { min: 1500, max: 1700, unit: 'ml',  label: '饮水' },
  SALT_DAILY_MAX:      { max: 5,    unit: 'g',   label: '食盐（上限）' },
  OIL_DAILY:           { min: 25,   max: 30,   unit: 'g',   label: '烹调油' },
  ADDED_SUGAR_DAILY_MAX:{ max: 50,  unit: 'g',   label: '添加糖（上限，建议 <25g）' },
  ALCOHOL_DAILY_MAX:   { max: 15,   unit: 'g',   label: '酒精（上限）' },

  // ===== 三餐能量分配 =====
  MEAL_ENERGY_RATIO: { breakfast: 0.3, lunch: 0.4, dinner: 0.3 },

  // ===== 成年男性 PAL（身体活动水平）能量需求 (kcal/d) =====
  // 来自指南附录"中国居民膳食能量和蛋白质 RNI"
  MALE_ENERGY: {
    '18-29': { light: 2250, moderate: 2600, vigorous: 3000 },
    '30-49': { light: 2100, moderate: 2400, vigorous: 2700 },
    '50-64': { light: 2100, moderate: 2300, vigorous: 2600 },
    '65-79': { light: 2050, moderate: 2150, vigorous: 2350 }
  },
  FEMALE_ENERGY: {
    '18-29': { light: 1800, moderate: 2100, vigorous: 2400 },
    '30-49': { light: 1750, moderate: 2000, vigorous: 2250 },
    '50-64': { light: 1700, moderate: 1900, vigorous: 2100 },
    '65-79': { light: 1650, moderate: 1750, vigorous: 1900 }
  },

  // ===== 宏量营养素 AMDR（可接受范围）=====
  CARB_AMDR: { min: 0.50, max: 0.65, label: '碳水化合物占总能量' },
  PROTEIN_AMDR: { min: 0.10, max: 0.15, label: '蛋白质占总能量' },
  FAT_AMDR: { min: 0.20, max: 0.30, label: '脂肪占总能量' },

  // ===== 工具函数 =====

  /**
   * 根据年龄/性别/PAL 估算每日能量需求（kcal/d）
   * @param {string} gender 'male' | 'female'
   * @param {number} age
   * @param {'light'|'moderate'|'vigorous'} pal
   */
  estimateEnergy(gender, age, pal = 'moderate') {
    const table = gender === 'male' ? this.MALE_ENERGY : this.FEMALE_ENERGY;
    const bucket = age <= 29 ? '18-29' : age <= 49 ? '30-49' : age <= 64 ? '50-64' : '65-79';
    return table[bucket][pal];
  },

  /**
   * 把硬性推荐量渲染为模型可直接读取的提示文本
   */
  toPromptContext() {
    const lines = [];
    lines.push(`【膳食常量库 版本=${this.VERSION} 来源=${this.SOURCE}】`);
    lines.push('- 蔬菜 ' + this.VEGETABLES_DAILY.min + '-' + this.VEGETABLES_DAILY.max + 'g/天');
    lines.push('- 新鲜水果 ' + this.FRUITS_DAILY.min + '-' + this.FRUITS_DAILY.max + 'g/天');
    lines.push('- 全谷物和杂豆 ' + this.WHOLE_GRAIN_BEAN_DAILY.min + '-' + this.WHOLE_GRAIN_BEAN_DAILY.max + 'g/天');
    lines.push('- 薯类 ' + this.TUBER_DAILY.min + '-' + this.TUBER_DAILY.max + 'g/天');
    lines.push('- 奶及奶制品 ' + this.MILK_DAILY.min + '-' + this.MILK_DAILY.max + 'ml/天');
    lines.push('- 大豆及坚果 ' + this.SOY_DAILY.min + '-' + this.SOY_DAILY.max + 'g/天');
    lines.push('- 鱼禽肉蛋 ' + this.MEAT_POULTRY_FISH_EGG_DAILY.min + '-' + this.MEAT_POULTRY_FISH_EGG_DAILY.max + 'g/天');
    lines.push('- 饮水 ' + this.WATER_DAILY.min + '-' + this.WATER_DAILY.max + 'ml/天');
    lines.push('- 食盐 <' + this.SALT_DAILY_MAX.max + 'g/天');
    lines.push('- 烹调油 ' + this.OIL_DAILY.min + '-' + this.OIL_DAILY.max + 'g/天');
    lines.push('- 添加糖 <' + this.ADDED_SUGAR_DAILY_MAX.max + 'g/天（建议 <25g）');
    lines.push('- 三餐能量分配：早餐 30% / 午餐 40% / 晚餐 30%');
    lines.push('- 宏量营养素 AMDR：碳水 50-65%、蛋白质 10-15%、脂肪 20-30%');
    return lines.join('\n');
  },

  /**
   * 验证推荐量是否落在指南区间
   * @returns {Array<{field:string, ok:boolean, value:number, range:object}>}
   */
  audit(nutrient) {
    const fields = {
      vegetables_g: this.VEGETABLES_DAILY,
      fruits_g: this.FRUITS_DAILY,
      milk_ml: this.MILK_DAILY,
      water_ml: this.WATER_DAILY,
      salt_g: this.SALT_DAILY_MAX
    };
    const out = [];
    Object.keys(fields).forEach(k => {
      if (nutrient[k] === undefined) return;
      const r = fields[k];
      const v = Number(nutrient[k]);
      let ok = true;
      if (r.min !== undefined && v < r.min) ok = false;
      if (r.max !== undefined && v > r.max) ok = false;
      out.push({ field: k, ok, value: v, range: r });
    });
    return out;
  }
};