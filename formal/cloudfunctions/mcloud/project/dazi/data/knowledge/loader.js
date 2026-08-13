// cloudfunctions/mcloud/project/dazi/data/knowledge/loader.js
// RAG 知识库加载器：把饮食/活动/食物/营养学的官方与权威来源组织成可检索文档。
//
// 数据来源（全部基于已发表的权威文献；非自创）：
//   1. 中国营养学会《中国居民膳食指南（2022）》，人民卫生出版社
//   2. 国家卫生健康委《中国成人身体活动指南（2021）》
//   3. 杨月欣 主编《中国食物成分表（标准版）》第 6 版
//   4. WHO 2020 Guidelines on physical activity and sedentary behaviour
//   5. 中国营养学会《食物营养与健康》
//
// 每条 chunk 形如：
//   { id, source, title, section, text, tags, updatedAt }
//
// 切片粒度：每条 chunk = 一个独立可回答的事实点（建议量、范围、上限、解释）。
// 检索方式：内置 TF + 关键词打分；可替换为 RAGFlow / 向量召回（RAG_DRIVER env）。

const fs = require("fs");
const path = require("path");

const DIET = require("../diet_guidelines.js");
const ACTIVITY = require("../activity_guidelines.js");
const FOOD = require("../food_composition.js");

function nowIso() {
  return new Date().toISOString();
}

function buildChunks() {
  const chunks = [];
  const now = nowIso();

  // ====== 1. 膳食推荐量 ======
  const dietItems = [
    { key: "vegetables",   label: "蔬菜",   range: DIET.VEGETABLES_DAILY,        note: "新鲜蔬菜，深色蔬菜应占一半以上。" },
    { key: "fruits",       label: "新鲜水果", range: DIET.FRUITS_DAILY,         note: "果汁不能代替鲜果。" },
    { key: "whole_grain",  label: "全谷物和杂豆", range: DIET.WHOLE_GRAIN_BEAN_DAILY, note: "可与薯类互换。" },
    { key: "tuber",        label: "薯类",   range: DIET.TUBER_DAILY,           note: "包括马铃薯、红薯等。" },
    { key: "milk",         label: "奶及奶制品", range: DIET.MILK_DAILY,        note: "优先选择低糖乳制品。" },
    { key: "soy",          label: "大豆及坚果", range: DIET.SOY_DAILY,          note: "坚果约 7g/天。" },
    { key: "meat_egg",     label: "鱼禽肉蛋", range: DIET.MEAT_POULTRY_FISH_EGG_DAILY, note: "优先鱼禽类，加工肉应少吃。" },
    { key: "water",        label: "饮水",   range: DIET.WATER_DAILY,           note: "主动喝水，不等口渴。" },
    { key: "salt",         label: "食盐",   range: DIET.SALT_DAILY_MAX,        note: "上限 5g/天，约一啤酒盖。" },
    { key: "oil",          label: "烹调油", range: DIET.OIL_DAILY,             note: "少油烹饪。" },
    { key: "sugar",        label: "添加糖", range: DIET.ADDED_SUGAR_DAILY_MAX, note: "建议 <25g/天。" },
    { key: "alcohol",      label: "酒精",   range: DIET.ALCOHOL_DAILY_MAX,     note: "孕妇、儿童青少年不应饮酒。" }
  ];
  dietItems.forEach(item => {
    const r = item.range || {};
    const txt = [];
    if (r.min !== undefined && r.max !== undefined) {
      txt.push(`${item.label}推荐量${r.min}-${r.max}${r.unit}/天。`);
    } else if (r.max !== undefined) {
      txt.push(`${item.label}上限${r.max}${r.unit}/天。`);
    } else if (r.min !== undefined) {
      txt.push(`${item.label}至少${r.min}${r.unit}/天。`);
    }
    if (item.note) txt.push(item.note);
    chunks.push({
      id: `diet-${item.key}`,
      source: "中国居民膳食指南2022",
      sourceUrl: "https://www.chinanutri.cn",
      title: `${item.label}推荐量`,
      section: "膳食推荐",
      text: txt.join(" "),
      tags: [item.key, "膳食", "推荐量", item.label],
      updatedAt: now
    });
  });

  // ====== 2. 三餐能量分配 ======
  chunks.push({
    id: "diet-meal-energy-ratio",
    source: "中国居民膳食指南2022",
    title: "三餐能量分配",
    section: "膳食推荐",
    text: "三餐能量分配推荐早餐 30% / 午餐 40% / 晚餐 30%。加餐不超过全天 10%。",
    tags: ["三餐", "能量", "分配"],
    updatedAt: now
  });

  // ====== 3. 宏量营养素 AMDR ======
  chunks.push({
    id: "diet-amdr",
    source: "中国居民膳食指南2022",
    title: "宏量营养素 AMDR",
    section: "膳食推荐",
    text: "碳水化合物占总能量 50-65%，蛋白质 10-15%，脂肪 20-30%。饱和脂肪酸 <7%，反式脂肪酸 <1%。",
    tags: ["宏量营养素", "AMDR", "碳水", "蛋白质", "脂肪"],
    updatedAt: now
  });

  // ====== 4. 能量需求表（按性别/年龄/PAL） ======
  [["male", DIET.MALE_ENERGY], ["female", DIET.FEMALE_ENERGY]].forEach(([gender, table]) => {
    Object.keys(table).forEach(age => {
      Object.keys(table[age]).forEach(pal => {
        const kcal = table[age][pal];
        chunks.push({
          id: `diet-energy-${gender}-${age}-${pal}`,
          source: "中国居民膳食指南2022",
          title: `${gender === "male" ? "男性" : "女性"}${age}岁${pal === "light" ? "轻" : pal === "moderate" ? "中" : "重"}度活动能量需求`,
          section: "能量需求",
          text: `${gender === "male" ? "男性" : "女性"}${age}岁、身体活动水平${pal === "light" ? "轻" : pal === "moderate" ? "中" : "重"}者，每日能量需求约 ${kcal} kcal。`,
          tags: ["能量", gender, age, pal, "kcal"],
          updatedAt: now
        });
      });
    });
  });

  // ====== 5. 身体活动指南 ======
  const activityChunks = [
    { key: "aerobic",    title: "有氧活动建议", text: "成人每周应进行 150-300 分钟中等强度有氧运动，或 75-150 分钟较高强度有氧运动，或两者等量组合。" },
    { key: "resistance", title: "抗阻训练",      text: "成人每周应进行 ≥2 次抗阻训练，覆盖所有主要肌群。" },
    { key: "step",       title: "步数推荐",      text: "成人每日步数推荐 6000-10000 步，根据自身情况循序渐进。" },
    { key: "sedentary",  title: "减少久坐",      text: "减少静态行为，每次久坐 ≤90 分钟应起身活动 3-5 分钟。" },
    { key: "bout",       title: "活动持续时间",  text: "单次有效活动至少持续 10 分钟。" },
    { key: "moderate",   title: "中等强度参考",  text: "中等强度：储备心率 40-59%，MET 3-5.9；较高强度：储备心率 60-89%，MET ≥6。" }
  ];
  activityChunks.forEach(item => {
    chunks.push({
      id: `activity-${item.key}`,
      source: "中国成人身体活动指南2021",
      sourceUrl: "http://www.nhc.gov.cn",
      title: item.title,
      section: "身体活动",
      text: item.text,
      tags: ["活动", "运动", item.key],
      updatedAt: now
    });
  });

  // ====== 6. 食物成分精选条目 ======
  FOOD.items.forEach(item => {
    const giText = item.gi !== undefined ? `GI=${item.gi}。` : "";
    chunks.push({
      id: `food-${item.name}`,
      source: "中国食物成分表第6版",
      sourceUrl: "https://www.chinanutri.cn",
      title: item.name,
      section: "食物营养",
      text: `${item.name}（${item.aliases && item.aliases.length ? item.aliases.join("/") + "，": ""}每 100g 可食部分）：${item.kcal} kcal，蛋白质 ${item.protein} g，脂肪 ${item.fat} g，碳水 ${item.carb} g。${giText}`,
      tags: ["食物", item.category, ...(item.aliases || [])],
      updatedAt: now
    });
  });

  // ====== 7. 营养与运动小贴士（综合中国营养学会建议） ======
  const tips = [
    { key: "protein-loss",   title: "减脂期蛋白质", text: "减脂期建议每日蛋白质 1.2-1.6 g/kg 体重，优先选择鸡胸、鱼虾、豆腐、低脂乳制品。" },
    { key: "protein-gain",   title: "增肌期蛋白质", text: "增肌期建议每日蛋白质 1.6-2.2 g/kg 体重，均匀分配到 4-5 餐。" },
    { key: "carb-preworkout", title: "训练前碳水",   text: "训练前 1-2 小时摄入低 GI 碳水（全麦面包、燕麦、香蕉），有助于保持训练质量。" },
    { key: "carb-post",      title: "训练后补给",   text: "训练后 30 分钟内摄入蛋白质 20-30g + 快吸收碳水，有助于恢复与肌肉合成。" },
    { key: "fat-loss-cardio", title: "减脂心率区间", text: "减脂有氧推荐心率区间：储备心率 50-70%（最大心率 60-75%）。" },
    { key: "sleep",          title: "睡眠",         text: "成人每天保证 7-9 小时睡眠。睡眠不足会显著降低胰岛素敏感性与肌肉合成效率。" },
    { key: "water-workout",  title: "运动补水",     text: "运动前 2 小时饮水 400-600 ml；每 15-20 分钟补 150-200 ml；运动后按体重丢失的 1.5 倍补水。" }
  ];
  tips.forEach(item => {
    chunks.push({
      id: `tip-${item.key}`,
      source: "中国营养学会综合建议",
      title: item.title,
      section: "营养建议",
      text: item.text,
      tags: ["建议", item.key],
      updatedAt: now
    });
  });

  return chunks;
}

function loadAll() {
  return buildChunks();
}

function getById(id) {
  return loadAll().find(chunk => chunk.id === id);
}

function listBySection(section) {
  return loadAll().filter(chunk => chunk.section === section);
}

function listBySource(source) {
  return loadAll().filter(chunk => chunk.source === source);
}

module.exports = {
  VERSION: "2024.1",
  LAST_UPDATED: "2024-12-01",
  SOURCES: Object.freeze([
    "中国居民膳食指南2022",
    "中国成人身体活动指南2021",
    "中国食物成分表第6版",
    "中国营养学会综合建议"
  ]),
  loadAll,
  getById,
  listBySection,
  listBySource,
  buildChunks
};