// cloudfunctions/mcloud/project/dazi/data/food_composition.js
// 数据来源：杨月欣主编《中国食物成分表（标准版）》第 6 版
// 精选常用条目约 50 条，覆盖主食、肉蛋奶、蔬果、坚果、调味。
// 所有数值均为"每 100g 可食部分"的含量；不包含不可食部分。
// 注意：实际值随品种/产地/烹饪有 ±10% 波动，AI 估算时应给出范围。

module.exports = {
  VERSION: '6.0.1',
  LAST_UPDATED: '2024-12-01',
  SOURCE: '中国食物成分表（标准版）第 6 版',
  UNIT: '每 100g 可食部分',
  TOLERANCE: 0.10, // ±10%

  // ===== 主食 / 谷物 =====
  items: [
    // 主食
    { name: '米饭（蒸熟，粳米）', aliases: ['白米饭','大米饭'], category: 'staple', kcal: 116, protein: 2.6, fat: 0.3, carb: 25.6, gi: 83 },
    { name: '馒头（小麦粉）', aliases: ['白馒头'], category: 'staple', kcal: 223, protein: 7.0, fat: 1.3, carb: 47.0, gi: 88 },
    { name: '面条（小麦粉，煮）', aliases: ['白面条'], category: 'staple', kcal: 109, protein: 3.9, fat: 0.4, carb: 23.0, gi: 81 },
    { name: '小米粥', aliases: ['小米汤'], category: 'staple', kcal: 46, protein: 1.4, fat: 0.7, carb: 8.4, gi: 71 },
    { name: '燕麦片', aliases: ['即食燕麦'], category: 'staple', kcal: 367, protein: 13.2, fat: 6.5, carb: 67.0, gi: 55 },
    { name: '玉米（鲜）', aliases: ['甜玉米'], category: 'staple', kcal: 112, protein: 4.0, fat: 1.2, carb: 22.8, gi: 55 },
    { name: '红薯', aliases: ['地瓜','番薯'], category: 'staple', kcal: 86, protein: 1.6, fat: 0.2, carb: 20.1, gi: 75 },
    { name: '土豆', aliases: ['马铃薯'], category: 'staple', kcal: 81, protein: 2.0, fat: 0.2, carb: 17.8, gi: 62 },
    { name: '全麦面包', aliases: [], category: 'staple', kcal: 246, protein: 9.2, fat: 2.4, carb: 48.5, gi: 65 },
    // 肉蛋奶
    { name: '鸡胸肉', aliases: ['鸡胸'], category: 'meat', kcal: 167, protein: 19.4, fat: 9.0, carb: 0.7 },
    { name: '牛肉（瘦）', aliases: ['牛腱子'], category: 'meat', kcal: 106, protein: 20.0, fat: 2.0, carb: 1.0 },
    { name: '猪肉（瘦）', aliases: ['瘦肉'], category: 'meat', kcal: 143, protein: 20.3, fat: 6.2, carb: 1.5 },
    { name: '猪里脊', aliases: [], category: 'meat', kcal: 155, protein: 20.2, fat: 7.9, carb: 0.7 },
    { name: '羊肉（瘦）', aliases: [], category: 'meat', kcal: 118, protein: 19.0, fat: 3.9, carb: 0.5 },
    { name: '鸭肉', aliases: [], category: 'meat', kcal: 240, protein: 15.5, fat: 19.7, carb: 0.2 },
    { name: '草鱼', aliases: [], category: 'meat', kcal: 113, protein: 16.6, fat: 5.0, carb: 0 },
    { name: '鲈鱼', aliases: [], category: 'meat', kcal: 105, protein: 18.6, fat: 3.4, carb: 0 },
    { name: '三文鱼', aliases: ['鲑鱼'], category: 'meat', kcal: 208, protein: 20.4, fat: 13.4, carb: 0 },
    { name: '虾仁', aliases: ['虾'], category: 'meat', kcal: 93, protein: 18.6, fat: 1.0, carb: 1.4 },
    { name: '鸡腿肉', aliases: [], category: 'meat', kcal: 181, protein: 16.7, fat: 12.6, carb: 0 },
    { name: '鸡蛋（白壳）', aliases: ['鸡蛋'], category: 'egg', kcal: 144, protein: 12.8, fat: 10.1, carb: 1.4 },
    { name: '鸭蛋', aliases: [], category: 'egg', kcal: 180, protein: 12.6, fat: 13.0, carb: 3.1 },
    { name: '牛奶（全脂）', aliases: ['纯牛奶'], category: 'dairy', kcal: 54, protein: 3.0, fat: 3.2, carb: 3.4 },
    { name: '牛奶（脱脂）', aliases: [], category: 'dairy', kcal: 33, protein: 3.1, fat: 0.3, carb: 4.8 },
    { name: '酸奶（全脂）', aliases: [], category: 'dairy', kcal: 76, protein: 2.5, fat: 3.0, carb: 9.7 },
    { name: '无糖酸奶', aliases: ['0 糖酸奶'], category: 'dairy', kcal: 63, protein: 3.0, fat: 3.3, carb: 5.2 },
    { name: '奶酪', aliases: ['干酪'], category: 'dairy', kcal: 328, protein: 22.6, fat: 26.0, carb: 3.6 },
    { name: '豆腐（北豆腐）', aliases: [], category: 'dairy', kcal: 116, protein: 12.2, fat: 8.1, carb: 1.9 },
    { name: '豆浆（无糖）', aliases: [], category: 'dairy', kcal: 31, protein: 3.8, fat: 1.5, carb: 1.4 },
    // 蔬果
    { name: '苹果', aliases: [], category: 'fruit', kcal: 53, protein: 0.4, fat: 0.1, carb: 13.4, gi: 36 },
    { name: '香蕉', aliases: [], category: 'fruit', kcal: 93, protein: 1.4, fat: 0.2, carb: 22.0, gi: 52 },
    { name: '橙子', aliases: [], category: 'fruit', kcal: 47, protein: 0.8, fat: 0.2, carb: 11.1, gi: 43 },
    { name: '葡萄', aliases: [], category: 'fruit', kcal: 44, protein: 0.5, fat: 0.2, carb: 10.3, gi: 43 },
    { name: '西红柿', aliases: ['番茄'], category: 'vegetable', kcal: 20, protein: 0.9, fat: 0.2, carb: 4.0, gi: 15 },
    { name: '黄瓜', aliases: [], category: 'vegetable', kcal: 16, protein: 0.8, fat: 0.2, carb: 2.9, gi: 15 },
    { name: '生菜', aliases: [], category: 'vegetable', kcal: 13, protein: 1.0, fat: 0.2, carb: 2.1, gi: 15 },
    { name: '菠菜', aliases: [], category: 'vegetable', kcal: 28, protein: 2.6, fat: 0.3, carb: 4.5, gi: 15 },
    { name: '胡萝卜', aliases: [], category: 'vegetable', kcal: 46, protein: 1.0, fat: 0.2, carb: 10.2, gi: 47 },
    { name: '西兰花', aliases: ['花椰菜'], category: 'vegetable', kcal: 34, protein: 2.8, fat: 0.4, carb: 4.3, gi: 15 },
    { name: '白菜', aliases: ['大白菜'], category: 'vegetable', kcal: 18, protein: 1.5, fat: 0.1, carb: 3.2, gi: 23 },
    { name: '茄子', aliases: [], category: 'vegetable', kcal: 23, protein: 1.1, fat: 0.2, carb: 5.0, gi: 15 },
    { name: '蘑菇', aliases: ['白蘑菇'], category: 'vegetable', kcal: 22, protein: 3.1, fat: 0.1, carb: 3.3, gi: 10 },
    // 坚果
    { name: '杏仁', aliases: [], category: 'nut', kcal: 578, protein: 21.2, fat: 50.0, carb: 19.5 },
    { name: '核桃', aliases: [], category: 'nut', kcal: 656, protein: 15.2, fat: 65.0, carb: 13.4 },
    { name: '花生（炒）', aliases: [], category: 'nut', kcal: 587, protein: 23.9, fat: 44.3, carb: 21.4 },
    { name: '腰果', aliases: [], category: 'nut', kcal: 552, protein: 18.5, fat: 43.8, carb: 30.2 },
    // 调味
    { name: '菜籽油', aliases: [], category: 'oil', kcal: 899, protein: 0, fat: 99.9, carb: 0 },
    { name: '橄榄油', aliases: [], category: 'oil', kcal: 899, protein: 0, fat: 99.9, carb: 0 },
    { name: '白砂糖', aliases: [], category: 'sugar', kcal: 400, protein: 0, fat: 0, carb: 99.8, gi: 65 },
    { name: '蜂蜜', aliases: [], category: 'sugar', kcal: 321, protein: 0.5, fat: 0, carb: 75.6, gi: 58 }
  ],

  // ===== 工具函数 =====

  /**
   * 模糊匹配：返回最相似的若干条
   * @param {string} name
   * @param {number} topN
   */
  search(name, topN = 5) {
    const lower = String(name || '').toLowerCase().trim();
    if (!lower) return [];
    const scored = this.items.map(item => {
      let score = 0;
      if (item.name === name) score = 100;
      else if (item.name.includes(name)) score = 80;
      else if (name.includes(item.name)) score = 70;
      (item.aliases || []).forEach(alias => {
        if (alias === name) score = Math.max(score, 95);
        else if (alias.includes(name) || name.includes(alias)) score = Math.max(score, 75);
      });
      return { item, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
    return scored.slice(0, topN).map(x => x.item);
  },

  /**
   * 计算单份食物的宏量营养素（输入克数）
   * @param {{kcal:number, protein:number, fat:number, carb:number, gi?:number}} item
   * @param {number} grams
   */
  portion(item, grams) {
    const k = grams / 100;
    return {
      kcal: Math.round(item.kcal * k),
      protein: Number((item.protein * k).toFixed(2)),
      fat: Number((item.fat * k).toFixed(2)),
      carb: Number((item.carb * k).toFixed(2))
    };
  },

  /**
   * 给 AI 估算时用的提示：声明数据源、波动区间、不可覆盖条目
   */
  toPromptContext() {
    return `【食物成分常量库 ${this.VERSION}，来源=${this.SOURCE}，单位=${this.UNIT}，波动≈±${Math.round(this.TOLERANCE*100)}%】
内置 ${this.items.length} 条常用食物。AI 估算卡路里与三大营养素时：
1) 命中条目用表中数值；
2) 未命中条目按"主类相近 + 烹饪方式"推断并给出 ±10% 范围；
3) 不可编造具体品牌/外卖产品的精确热量。`;
  }
};