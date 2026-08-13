// cloudfunctions/mcloud/project/dazi/data/activity_guidelines.js
// 数据来源：
//   - 国家卫健委发布《中国成人身体活动指南（2021）》
//   - WHO 2020 Guidelines on Physical Activity and Sedentary Behaviour
// 注入到 agent context 与 goal_config 文案，使训练/活动建议有官方依据。

module.exports = {
  VERSION: '2021.1',
  LAST_UPDATED: '2024-12-01',
  SOURCE_ADULT: '国家卫健委《中国成人身体活动指南（2021）》',
  SOURCE_WHO: 'WHO 2020 Guidelines on Physical Activity and Sedentary Behaviour',

  // ===== 通用推荐 =====
  AEROBIC_MIN_WEEK:   { min: 150, max: 300, unit: 'min', label: '中等强度有氧（每周）' },
  AEROBIC_VIGOROUS_MIN_WEEK: { min: 75, unit: 'min', label: '较高强度有氧（每周）' },
  RESISTANCE_SESSIONS_WEEK: { min: 2, unit: '次', label: '抗阻训练（每周）' },
  STEPS_DAILY:       { min: 6000, max: 10000, unit: '步', label: '每日步数推荐' },
  SEDENTARY_BREAK_MIN: { max: 90, unit: 'min', label: '静态行为每段时长（上限）' },
  ACTIVITY_BOUT_MIN: { min: 10, unit: 'min', label: '单次有效活动最短时长' },

  // ===== 强度参考 (Borg/HRmax) =====
  MODERATE_HRR: { min: 0.40, max: 0.59, label: '中等强度储备心率百分比' },
  VIGOROUS_HRR: { min: 0.60, max: 0.89, label: '较高强度储备心率百分比' },
  MODERATE_MET: { min: 3, max: 5.9, label: '中等强度 MET 区间' },
  VIGOROUS_MET: { min: 6, unit: 'MET', label: '较高强度 MET 下限' },

  // ===== 工具函数 =====

  /**
   * 按 WHO 通用指南，把每周目标活动分钟数转成活动量评分
   * @returns {'below'|'meets'|'exceeds'}
   */
  rateAerobicWeeklyMinutes(min) {
    if (min < 150) return 'below';
    if (min <= 300) return 'meets';
    return 'exceeds';
  },

  /**
   * 把指南渲染为 agent 可读的提示文本
   */
  toPromptContext() {
    const lines = [];
    lines.push(`【身体活动常量库 版本=${this.VERSION} 来源=${this.SOURCE_ADULT} & ${this.SOURCE_WHO}】`);
    lines.push('- 每周 150-300 分钟中等强度有氧（或 75 分钟较高强度）');
    lines.push('- 每周 ≥2 次抗阻训练，覆盖主要肌群');
    lines.push('- 每日步数 6000-10000');
    lines.push('- 主动通勤与休闲活动，鼓励爬楼、家务');
    lines.push('- 减少久坐，每次静态行为 ≤90 分钟应起身活动');
    lines.push('- 单次有效活动 ≥10 分钟');
    lines.push('- 中等强度：储备心率 40-59%，MET 3-5.9；较高强度：储备心率 60-89%，MET ≥6');
    return lines.join('\n');
  },

  /**
   * 根据周活动量、训练频次给出建议状态
   * @param {{weeklyMinutes:number, resistanceSessions:number}} stats
   * @returns {{status:'below'|'meets'|'exceeds', suggestions:string[]}}
   */
  audit(stats) {
    const suggestions = [];
    const aerobic = this.rateAerobicWeeklyMinutes(stats.weeklyMinutes || 0);
    const resistance = (stats.resistanceSessions || 0) >= this.RESISTANCE_SESSIONS_WEEK.min ? 'meets' : 'below';
    if (aerobic === 'below') suggestions.push(`本周有氧 ${stats.weeklyMinutes || 0} 分钟，未达 150 分钟下限，建议每日加 1 次 20-30 分钟快走/慢跑。`);
    if (resistance === 'below') suggestions.push(`本周抗阻训练 ${stats.resistanceSessions || 0} 次，未达 2 次下限，建议补充 1 次自重训练。`);
    return {
      status: aerobic === 'below' || resistance === 'below' ? 'below' : 'meets',
      suggestions
    };
  }
};