const userStorage = require("../../../biz/user_storage.js");
const STORAGE_KEY = "fitness_diet_records";
const cloudHelper = require("../../../../../helper/cloud_helper.js");
const nutritionHelper = require("../../../../../helper/nutrition_helper.js");

const PRESETS = [
  { category: "常用", foods: [
    { name: "鸡蛋", calories: 75 },
    { name: "牛奶", calories: 130 },
    { name: "米饭", calories: 230 },
    { name: "鸡胸肉", calories: 165 }
  ]},
  { category: "优质碳水", foods: [
    { name: "燕麦", calories: 150 },
    { name: "红薯", calories: 110 },
    { name: "全麦面包", calories: 90 },
    { name: "玉米", calories: 120 }
  ]},
  { category: "蛋白质", foods: [
    { name: "虾仁", calories: 100 },
    { name: "牛肉", calories: 210 },
    { name: "豆腐", calories: 85 },
    { name: "无糖酸奶", calories: 95 }
  ]}
];

Page({
  data: {
    statusBarHeight: 44,
    date: "",
    meal: "breakfast",
    mealName: "早餐",
    searchValue: "",
    presets: PRESETS,
    filteredPresets: PRESETS,
    selectedFood: null,
    customName: "",
    customCalories: "",
    estimatedProtein: "",
    estimatedCarbs: "",
    estimatedFat: "",
    estimatedModel: "",
    amount: "1",
    estimating: false,
    editor: {
      visible: false,
      field: "",
      title: "",
      value: "",
      unit: "",
      inputType: "number",
      min: 0,
      max: 99999
    }
  },

  onLoad(options) {
    const info = wx.getSystemInfoSync();
    const names = { breakfast: "早餐", lunch: "午餐", dinner: "晚餐", snack: "加餐" };
    this.setData({
      statusBarHeight: info.statusBarHeight || 44,
      date: options.date || "",
      meal: options.meal || "breakfast",
      mealName: names[options.meal] || "早餐"
    });
  },

  goBack() {
    wx.navigateBack();
  },

  onSearch(e) {
    const searchValue = e.detail.value;
    const keyword = searchValue.trim().toLowerCase();
    const filteredPresets = keyword
      ? PRESETS.map(group => ({
          category: group.category,
          foods: group.foods.filter(food => food.name.toLowerCase().includes(keyword))
        })).filter(group => group.foods.length)
      : PRESETS;
    this.setData({ searchValue, filteredPresets });
  },

  selectFood(e) {
    const { name, calories } = e.currentTarget.dataset;
    this.setData({
      selectedFood: { name, calories: Number(calories) },
      searchValue: "",
      customName: name,
      customCalories: String(calories),
      estimatedModel: ""
    });
  },

  onNameInput(e) {
    this.setData({
      customName: e.detail.value,
      searchValue: "",
      selectedFood: null,
      estimatedProtein: "",
      estimatedCarbs: "",
      estimatedFat: "",
      estimatedModel: ""
    });
  },

  onCaloriesInput(e) {
    this.setData({
      customCalories: e.detail.value.replace(/[^\d]/g, ""),
      selectedFood: null
    });
  },

  onAmountInput(e) {
    this.setData({ amount: e.detail.value.replace(/[^\d.]/g, "") });
  },

  openEditor(e) {
    const field = e.currentTarget.dataset.field;
    const configs = {
      customName: { title: "修改食物名称", inputType: "text", unit: "", min: 0, max: 50 },
      customCalories: { title: "修改单份热量", inputType: "number", unit: "kcal", min: 0, max: 10000 },
      amount: { title: "修改食物份数", inputType: "number", unit: "份", min: 0.1, max: 100 }
    };
    const config = configs[field];
    if (!config) return;
    this.setData({
      editor: Object.assign({
        visible: true,
        field,
        value: this.data[field] || ""
      }, config)
    });
  },

  closeEditor() {
    this.setData({ "editor.visible": false });
  },

  confirmEditor(e) {
    const field = this.data.editor.field;
    this.setData({
      [field]: e.detail.value,
      selectedFood: field === "customCalories" ? null : this.data.selectedFood,
      "editor.visible": false
    });
  },

  async estimateWithAi() {
    const food = String(this.data.searchValue || this.data.customName || "").trim();
    if (!food) {
      wx.showToast({ title: "请先输入食物名称", icon: "none" });
      return;
    }
    this.setData({ estimating: true });
    try {
      const result = await cloudHelper.callCloud("ai/estimate_calories", {
        food
      }, { hint: false });
      const estimate = result && result.data;
      const calories = nutritionHelper.hasMacroData(estimate)
        ? nutritionHelper.calculateCaloriesByMacros(
            estimate.carbs,
            estimate.protein,
            estimate.fat
          )
        : Math.round(Number(estimate && estimate.calories) || 0);
      if (!calories) throw new Error("EMPTY_CALORIES");
      this.setData({
        customName: estimate.name || food,
        searchValue: food,
        customCalories: String(calories),
        estimatedProtein: String(estimate.protein || ""),
        estimatedCarbs: String(estimate.carbs || ""),
        estimatedFat: String(estimate.fat || ""),
        estimatedModel: String(estimate.model || "mimo-v2-flash"),
        selectedFood: null
      });
      wx.showToast({ title: `Flash 估算约 ${calories} kcal`, icon: "none" });
    } catch (err) {
      wx.showToast({ title: "AI 暂时无法估算，请手动填写", icon: "none" });
    } finally {
      this.setData({ estimating: false });
    }
  },

  saveFood() {
    const name = this.data.customName.trim();
    const baseCalories = Number(this.data.customCalories);
    const amount = Number(this.data.amount) || 1;
    if (!name || !baseCalories) {
      wx.showToast({ title: "请填写食物名称和热量", icon: "none" });
      return;
    }

    const records = userStorage.get(STORAGE_KEY, {});
    const dateRecord = records[this.data.date] || {};
    const mealItems = dateRecord[this.data.meal] || [];
    const protein = Math.round((Number(this.data.estimatedProtein) || 0) * amount * 10) / 10;
    const carbs = Math.round((Number(this.data.estimatedCarbs) || 0) * amount * 10) / 10;
    const fat = Math.round((Number(this.data.estimatedFat) || 0) * amount * 10) / 10;
    const hasEstimatedMacros = [
      this.data.estimatedProtein,
      this.data.estimatedCarbs,
      this.data.estimatedFat
    ].some(value => value !== "" && value !== null && value !== undefined);
    const item = {
      id: Date.now(),
      name: amount === 1 ? name : `${name} × ${amount}`,
      calories: hasEstimatedMacros
        ? nutritionHelper.calculateCaloriesByMacros(carbs, protein, fat)
        : Math.round(baseCalories * amount)
    };
    if (hasEstimatedMacros) Object.assign(item, { protein, carbs, fat });
    mealItems.push(item);
    dateRecord[this.data.meal] = mealItems;
    records[this.data.date] = dateRecord;
    userStorage.set(STORAGE_KEY, records);
    wx.showToast({ title: "已添加", icon: "success" });
    setTimeout(() => wx.navigateBack(), 350);
  }
});
