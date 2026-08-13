const bodyMetricsService = require("../../../biz/body_metrics_service.js");
const fitnessStore = require("../../../store/fitness_store.js");
const goalConfig = require("../../../config/goal_config.js");
const cloudHelper = require("../../../../../helper/cloud_helper.js");

Page({
  data: {
    statusBarHeight: 44,
    overview: [],
    composition: [],
    circumference: [],
    insights: [],
    history: [],
    energyAssessment: {},
    importText: "",
    selectedImagePath: "",
    pendingMetrics: null,
    pendingFields: [],
    editing: false,
    goalName: "",
    recognizingImage: false,
    recognitionHint: "",
    editor: {
      visible: false,
      key: "",
      title: "",
      value: "",
      unit: "",
      min: 0,
      max: 99999
    }
  },

  onLoad() {
    const info = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: info.statusBarHeight || 44 });
  },

  onShow() {
    this._refresh();
  },

  goBack() {
    wx.navigateBack();
  },

  onImportText(e) {
    this.setData({ importText: e.detail.value });
  },

  parseImportText() {
    if (this.data.selectedImagePath) {
      this._recognizeSelectedImage();
      return;
    }
    const metrics = bodyMetricsService.parseBodyMetricsText(this.data.importText);
    if (!Object.keys(metrics).length) {
      wx.showToast({ title: "未识别到身体指标，请检查文本", icon: "none" });
      return;
    }
    this._showConfirmation(metrics);
  },

  pasteBodyData() {
    wx.getClipboardData({
      success: ({ data }) => {
        const importText = String(data || "").trim();
        this.setData({
          importText,
          selectedImagePath: "",
          recognitionHint: importText ? "已粘贴文本，点击下方识别并预览" : ""
        });
        if (!importText) wx.showToast({ title: "剪贴板中没有文字", icon: "none" });
      },
      fail: () => wx.showToast({ title: "无法读取剪贴板", icon: "none" })
    });
  },

  editMetric(e) {
    const key = e.currentTarget.dataset.key;
    const definition = bodyMetricsService.FIELD_DEFINITIONS.find(item => item.key === key);
    if (!definition) return;
    const latest = bodyMetricsService.getLatestRecord();
    this.setData({
      editor: {
        visible: true,
        key,
        title: `记录${definition.label}`,
        value: latest && latest.metrics[key] !== undefined ? latest.metrics[key] : "",
        unit: definition.unit,
        min: 0,
        max: 10000
      }
    });
  },

  editPendingMetric(e) {
    const key = e.currentTarget.dataset.key;
    const definition = bodyMetricsService.FIELD_DEFINITIONS.find(item => item.key === key);
    if (!definition) return;
    this.setData({
      editor: {
        visible: true,
        key,
        title: `修改${definition.label}`,
        value: this.data.pendingMetrics[key],
        unit: definition.unit,
        min: 0,
        max: 10000
      }
    });
  },

  closeEditor() {
    this.setData({ "editor.visible": false });
  },

  confirmEditor(e) {
    const key = this.data.editor.key;
    const value = e.detail.value;
    if (this.data.pendingMetrics) {
      const pendingMetrics = Object.assign({}, this.data.pendingMetrics, { [key]: value });
      let pendingFields = this.data.pendingFields.map(field => (
        field.key === key ? Object.assign({}, field, { value }) : field
      ));
      if (!pendingFields.some(field => field.key === key)) {
        const definition = bodyMetricsService.FIELD_DEFINITIONS.find(field => field.key === key);
        if (definition) {
          pendingFields = pendingFields.concat(Object.assign({}, definition, {
            value,
            confidence: 1,
            enabled: true
          }));
        }
      }
      this.setData({ pendingMetrics, pendingFields, "editor.visible": false });
      return;
    }
    this.setData({ "editor.visible": false });
    this._showConfirmation({ [key]: value });
  },

  togglePendingField(e) {
    const key = e.currentTarget.dataset.key;
    const pendingFields = this.data.pendingFields.map(field => (
      field.key === key ? Object.assign({}, field, { enabled: e.detail.value }) : field
    ));
    this.setData({ pendingFields });
  },

  uploadBodyScreenshot() {
    wx.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      sourceType: ["album", "camera"],
      success: ({ tempFilePaths }) => {
        const path = tempFilePaths && tempFilePaths[0];
        if (!path) return;
        this.setData({
          selectedImagePath: path,
          importText: "",
          recognitionHint: "截图已选择，点击下方识别并预览"
        });
      }
    });
  },

  async _recognizeSelectedImage() {
    if (!this.data.selectedImagePath || this.data.recognizingImage) return;
    this.setData({ recognizingImage: true, recognitionHint: "正在读取体脂秤截图中的指标..." });
    try {
      const imageData = await this._imageToDataUri(this.data.selectedImagePath);
      const response = await cloudHelper.callCloudData("ai/send", {
        message: [
          "这是 body_scale_screenshot。请逐项读取整张长截图，不要只看顶部。",
          "必须返回 profilePatch；只填写图片中清晰可见的值，不得猜测。",
          "字段使用：weight,bmi,bodyFatRate,bodyWaterMass,fatMass,boneMass,proteinMass,",
          "muscleMass,muscleRate,waterRate,proteinRate,boneRate,skeletalMuscleMass,",
          "deviceBmr,visceralFatLevel,waistHipRatio,bodyAge,leanBodyMass,heartRate,",
          "standardWeight,weightControl,fatControl。",
          "基础代谢截图值必须写入 deviceBmr。允许部分识别成功。"
        ].join(""),
        profile: fitnessStore.getUserProfile(),
        imageData: [imageData],
        images: [],
        intent: {
          intent: "body_data_recognition",
          confidence: 1,
          responseMode: "generate_proposal",
          shouldUseHistory: false
        }
      }, { hint: false });
      const answer = response && response.answer || {};
      const proposals = answer.payload && answer.payload.proposals || [];
      const proposal = proposals.find(item => item.type === "profilePatch");
      const candidate = proposal && proposal.payload && proposal.payload.profilePatch ||
        answer.memory && answer.memory.profilePatch ||
        answer.payload && answer.payload.profilePatch ||
        bodyMetricsService.parseBodyMetricsText(answer.content);
      const metrics = bodyMetricsService.normalizeMetrics(candidate);
      if (!Object.keys(metrics).length) throw new Error("NO_BODY_DATA");
      this.setData({
        recognitionHint: Object.keys(metrics).length < 5
          ? "已识别部分指标，可在预览中手动补充"
          : `已识别 ${Object.keys(metrics).length} 项指标`
      });
      this._showConfirmation(metrics, "image");
    } catch (error) {
      this.setData({ recognitionHint: "未识别出核心指标，可重新上传或粘贴文字后修正" });
      wx.showToast({ title: "识别不完整，请重试或粘贴数据", icon: "none" });
    } finally {
      this.setData({ recognizingImage: false });
    }
  },

  onPendingInput(e) {
    const key = e.currentTarget.dataset.key;
    const pendingMetrics = Object.assign({}, this.data.pendingMetrics, {
      [key]: e.detail.value
    });
    this.setData({ pendingMetrics });
  },

  enablePendingEdit() {
    const preferred = [
      "weight",
      "bmi",
      "bodyFatRate",
      "muscleMass",
      "deviceBmr",
      "visceralFatLevel"
    ];
    const missing = preferred
      .map(key => bodyMetricsService.FIELD_DEFINITIONS.find(field => field.key === key))
      .filter(field => field && this.data.pendingMetrics[field.key] === undefined);
    if (!missing.length) {
      wx.showToast({ title: "核心指标已识别，可点击数值修改", icon: "none" });
      return;
    }
    wx.showActionSheet({
      itemList: missing.map(field => field.label),
      success: ({ tapIndex }) => {
        const field = missing[tapIndex];
        if (!field) return;
        this.setData({
          editor: {
            visible: true,
            key: field.key,
            title: `补充${field.label}`,
            value: "",
            unit: field.unit,
            min: 0,
            max: 10000
          }
        });
      }
    });
  },

  cancelPending() {
    this.setData({ pendingMetrics: null, pendingFields: [], editing: false });
  },

  confirmPending() {
    const selected = {};
    this.data.pendingFields.forEach(field => {
      if (field.enabled !== false) selected[field.key] = this.data.pendingMetrics[field.key];
    });
    if (!Object.keys(selected).length) {
      wx.showToast({ title: "请至少选择一项数据", icon: "none" });
      return;
    }
    const result = bodyMetricsService.saveConfirmedMetrics(selected, {
      source: this._pendingSource || (this.data.importText ? "text_import" : "manual")
    });
    if (!result.success || !result.verified) {
      wx.showToast({ title: result.errorMessage || "写入失败", icon: "none" });
      return;
    }
    this.setData({
      pendingMetrics: null,
      pendingFields: [],
      editing: false,
      importText: ""
      ,
      selectedImagePath: "",
      recognitionHint: ""
    });
    this._refresh();
    wx.showToast({ title: "身体数据已写入成功", icon: "success" });
  },

  _showConfirmation(metrics, source) {
    const clean = bodyMetricsService.normalizeMetrics(metrics);
    const pendingFields = bodyMetricsService.FIELD_DEFINITIONS
      .filter(field => clean[field.key] !== undefined)
      .map(field => Object.assign({}, field, {
        value: clean[field.key],
        confidence: source === "image" ? 0.72 : 1,
        enabled: true
      }));
    this._pendingSource = source || "manual";
    this.setData({
      pendingMetrics: clean,
      pendingFields,
      editing: false
    });
  },

  async _imageToDataUri(path) {
    const qualities = [82, 68, 52];
    let lastData = "";
    for (const quality of qualities) {
      const compressedPath = await new Promise((resolve, reject) => {
        wx.compressImage({
          src: path,
          quality,
          success: ({ tempFilePath }) => resolve(tempFilePath || path),
          fail: reject
        });
      });
      lastData = await new Promise((resolve, reject) => {
        wx.getFileSystemManager().readFile({
          filePath: compressedPath,
          encoding: "base64",
          success: ({ data }) => resolve(data),
          fail: reject
        });
      });
      if (lastData.length <= 760000) break;
    }
    if (!lastData) throw new Error("EMPTY_IMAGE_DATA");
    return `data:image/jpeg;base64,${lastData}`;
  },

  _refresh() {
    const view = bodyMetricsService.getMetricViewModel();
    const insights = bodyMetricsService.getSevenDayInsights();
    const profile = fitnessStore.getUserProfile();
    this.setData({
      overview: view.basic,
      composition: view.composition,
      circumference: view.circumference,
      insights: [
        { label: "近 7 日平均摄入热量", value: insights.averageCalories || "--", unit: insights.averageCalories ? "kcal" : "" },
        { label: "近 7 日平均蛋白质", value: insights.averageProtein || "--", unit: insights.averageProtein ? "g" : "" },
        { label: "近 7 日平均运动消耗", value: insights.averageExercise || "--", unit: insights.averageExercise ? "kcal" : "" },
        { label: "近 7 日体重变化", value: insights.weightChange || "0", unit: "kg" }
      ],
      history: bodyMetricsService.getRecords().slice(-8).reverse().map(item => ({
        id: item.id,
        date: item.date,
        weight: item.metrics.weight === undefined ? "--" : item.metrics.weight,
        bodyFat: item.metrics.bodyFatRate === undefined ? "--" : item.metrics.bodyFatRate
      })),
      goalName: goalConfig.getGoalConfig(profile.goal).name
      ,
      energyAssessment: profile.energyAssessment || {}
    });
  }
});
