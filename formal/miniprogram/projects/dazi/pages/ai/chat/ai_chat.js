const ProjectBiz = require("../../../biz/project_biz.js");
const cloudHelper = require("../../../../../helper/cloud_helper.js");
const userStorage = require("../../../biz/user_storage.js");
const nutritionHelper = require("../../../../../helper/nutrition_helper.js");
const coachContextService = require("../../../biz/coach_context_service.js");
const aiWriteService = require("../../../biz/ai_write_service.js");
const aiResponseFallback = require("../../../biz/ai_response_fallback.js");
const foodRecognitionService = require("../../../biz/food_recognition_service.js");
const bodyMetricsService = require("../../../biz/body_metrics_service.js");
const aiIntentService = require("../../../biz/ai_intent_service.js");
const agentRecordService = require("../../../biz/agent_record_service.js");
const proposalBuilder = require("../../../biz/proposal_builder.js");
const proposalPatch = require("../../../biz/proposal_patch.js");
const validators = require("../../../biz/validators.js");
const safeTop = require("../../../../../helper/safe_top.js");
const COACH_KEY = "fitness_ai_coach_profile";
const PROFILE_KEY = "fitness_profile";
const DIET_KEY = "fitness_diet_records";
const TRAINING_KEY = "fitness_training_plan";
const WORKOUT_STATS_KEY = "fitness_workout_stats";
const DEFAULT_COACH = { name: "AI 教练", avatar: "", initials: "AI" };

Page({
  data: {
    sessionId: "",
    messages: [],
    inputValue: "",
    selectedImages: [],
    showImageSourceMenu: false,
    sending: false,
    presenting: false,
    uploading: false,
    requestError: "",
    lastMessage: "",
    lastImages: [],
    scrollTop: 0,
    scrollIntoView: "",
    scrollWithAnimation: false,
    conversationSettled: false,
    statusBarHeight: 44,
    safeTop: 88,
    keyboardHeight: 0,
    composerRestBottom: 99,
    messageBottomInset: 16,
    pageBottomInset: 0,
    messageListTop: 170,
    messageListBottom: 220,
    coach: DEFAULT_COACH,
    providerConfigured: false,
    providerStatus: "连接中",
    thinkingText: "正在思考",
    placeholderText: "说说刚吃了什么",
    proactiveGreeting: "",
    coachContext: null,
    quickQuestions: [
      "拍照记饮食",
      "记录身体变化",
      "生成今日饮食建议",
      "安排居家训练"
    ],
    mealOptions: ["早餐", "午餐", "晚餐", "加餐"],
    proposalEditor: {
      visible: false,
      title: "",
      value: "",
      inputType: "text",
      messageIndex: -1,
      proposalIndex: -1,
      foodIndex: -1,
      field: ""
    },
    workoutWriteOptions: [
      "加到这一天",
      "替换这一天的训练",
      "安排到明天",
      "保存到本周计划",
      "存成常用模板"
    ]
  },

  async onLoad(options) {
    ProjectBiz.initPage(this);
    const info = wx.getSystemInfoSync();
    const safeTopInfo = safeTop.getAll();
    const computedSafeTop = safeTopInfo.safeTop;
    this.setData(Object.assign(safeTop.injectInto({}), {
      composerRestBottom: this._calculateComposerRestBottom(info),
      messageListTop: this._calculateMessageListTop(info, computedSafeTop),
      sessionId: options.sessionId || ""
    }));
    this._keyboardHandler = ({ height }) => {
      const keyboardHeight = Math.max(0, Number(height) || 0);
      this.setData({ keyboardHeight }, () => {
        this._setTabBarHidden(keyboardHeight > 0);
        this._measureComposer(Boolean(keyboardHeight));
      });
    };
    wx.onKeyboardHeightChange(this._keyboardHandler);
    this._startPlaceholderRotation();
    await this._loadProviderStatus();
    await this._loadMessages();
  },

  onReady() {
    this._measureComposer(true);
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.setData({ current: 2 });
    try {
      const info = wx.getSystemInfoSync();
      this.setData({
        composerRestBottom: this._calculateComposerRestBottom(info),
        messageListTop: this._calculateMessageListTop(info, this.data.safeTop)
      });
    } catch (error) {
      // Keep existing layout metrics if system metrics are temporarily unavailable.
    }
    this._loadCoachProfile();
    this._refreshCoachContext();
    const pendingSessionId = wx.getStorageSync("fitness_pending_ai_session");
    if (pendingSessionId && pendingSessionId !== this.data.sessionId) {
      wx.removeStorageSync("fitness_pending_ai_session");
      this.setData({ sessionId: pendingSessionId, messages: [] }, () => this._loadMessages());
    }
    // [v2] 饮食页等外部跳转带来的预设问题
    const presetQuestion = wx.getStorageSync("fitness_ai_preset_question");
    if (presetQuestion) {
      wx.removeStorageSync("fitness_ai_preset_question");
      this.setData({ inputValue: presetQuestion }, () => this.sendMessage());
    }
    this._measureComposer(Boolean(this.data.messages.length));
  },

  onUnload() {
    if (this._keyboardHandler) wx.offKeyboardHeightChange(this._keyboardHandler);
    if (this._placeholderTimer) clearInterval(this._placeholderTimer);
    this._stopThinkingRotation();
    if (this._answerTimer) clearTimeout(this._answerTimer);
    this._setTabBarHidden(false);
  },

  onInput(e) {
    this.setData({ inputValue: e.detail.value });
  },

  useQuickQuestion(e) {
    const rawText = e.currentTarget.dataset.text;
    const promptMap = {
      "拍照记饮食": "请帮我记录饮食。如果需要图片，请提示我上传餐食照片。",
      "记录身体变化": "请帮我记录身体变化，比如体重、体脂或围度，并生成可确认保存的身体数据草稿。",
      "生成今日饮食建议": "请根据我的目标和已有记录生成今日饮食建议。",
      "安排居家训练": "请为我制定一个今天可以完成的居家训练计划，并生成可确认保存的训练计划草稿。"
    };
    const text = promptMap[rawText] || rawText;
    this._pendingQuickAction = rawText;
    this.setData({ inputValue: text }, () => this.sendMessage());
  },

  // [v2] 快捷 pill 行点击
  onQuickPill(e) {
    const q = e.currentTarget.dataset.q;
    if (!q) return;
    this.setData({ inputValue: q }, () => this.sendMessage());
  },

  toggleImageSourceMenu() {
    const showImageSourceMenu = !this.data.showImageSourceMenu;
    if (showImageSourceMenu) wx.hideKeyboard();
    this.setData({ showImageSourceMenu });
  },

  closeImageSourceMenu() {
    this.setData({ showImageSourceMenu: false });
  },

  chooseImageSource(e) {
    const source = e.currentTarget.dataset.source;
    this.setData({ showImageSourceMenu: false });
    this._chooseImages(source);
  },

  _chooseImages(source) {
    const remaining = 3 - this.data.selectedImages.length;
    if (remaining <= 0) {
      wx.showToast({ title: "最多上传 3 张图片", icon: "none" });
      return;
    }
    wx.chooseImage({
      count: source === "camera" ? 1 : remaining,
      sizeType: ["compressed"],
      sourceType: [source],
      success: ({ tempFilePaths, tempFiles }) => {
        const rawFiles = (tempFiles || []).length
          ? tempFiles
          : (tempFilePaths || []).map(path => ({ path }));
        const files = rawFiles.filter(item => {
          if (Number(item.size || 0) <= 50 * 1024 * 1024) return true;
          wx.showToast({ title: "单张图片不能超过 50 MB", icon: "none" });
          return false;
        });
        const selectedImages = this.data.selectedImages.concat(
          files.map(item => ({
            path: item.path || item.tempFilePath,
            size: item.size || 0
          })).filter(item => item.path)
        );
        this.setData({ selectedImages }, () => this._measureComposer(true));
      },
      fail: ({ errMsg }) => {
        if (!String(errMsg || "").includes("cancel")) {
          wx.showToast({ title: "无法获取图片，请检查相机或相册权限", icon: "none" });
        }
      }
    });
  },

  removeSelectedImage(e) {
    const index = Number(e.currentTarget.dataset.index);
    this.setData({
      selectedImages: this.data.selectedImages.filter((item, itemIndex) => itemIndex !== index)
    }, () => this._measureComposer(true));
  },

  previewSelectedImage(e) {
    const urls = this.data.selectedImages.map(item => item.path);
    wx.previewImage({ current: urls[Number(e.currentTarget.dataset.index)], urls });
  },

  previewMessageImage(e) {
    const message = this.data.messages[Number(e.currentTarget.dataset.message)];
    const urls = message && message.AI_MESSAGE_PAYLOAD
      ? (message.AI_MESSAGE_PAYLOAD.images || [])
      : [];
    wx.previewImage({ current: urls[Number(e.currentTarget.dataset.index)], urls });
  },

  confirmAgentProposal(e) {
    this.acceptProposal(e);
  },

  onProposalDateChange(e) {
    const messageIndex = Number(e.currentTarget.dataset.index);
    const proposalIndex = Number(e.currentTarget.dataset.proposal);
    this.setData({
      [`messages[${messageIndex}].AI_MESSAGE_PAYLOAD.proposals[${proposalIndex}].uiDate`]:
        e.detail.value
    });
  },

  onProposalMealChange(e) {
    const messageIndex = Number(e.currentTarget.dataset.index);
    const proposalIndex = Number(e.currentTarget.dataset.proposal);
    const uiMealIndex = Number(e.detail.value) || 0;
    this.setData({
      [`messages[${messageIndex}].AI_MESSAGE_PAYLOAD.proposals[${proposalIndex}].uiMealIndex`]:
        uiMealIndex,
      [`messages[${messageIndex}].AI_MESSAGE_PAYLOAD.proposals[${proposalIndex}].uiMealPickerIndex`]:
        uiMealIndex,
      [`messages[${messageIndex}].AI_MESSAGE_PAYLOAD.proposals[${proposalIndex}].uiMealLabel`]:
        this.data.mealOptions[uiMealIndex]
    });
  },

  onProposalFoodNameInput(e) {
    const messageIndex = Number(e.currentTarget.dataset.index);
    const proposalIndex = Number(e.currentTarget.dataset.proposal);
    this.setData({
      [`messages[${messageIndex}].AI_MESSAGE_PAYLOAD.proposals[${proposalIndex}].uiFoodName`]:
        e.detail.value
    });
  },

  onProposalFoodAmountInput(e) {
    const messageIndex = Number(e.currentTarget.dataset.index);
    const proposalIndex = Number(e.currentTarget.dataset.proposal);
    const foodIndex = Number(e.currentTarget.dataset.food);
    const proposal = this.data.messages[messageIndex].AI_MESSAGE_PAYLOAD.proposals[proposalIndex];
    const item = proposal.payload.items[foodIndex];
    const amount = Math.max(0, Number(e.detail.value) || 0);
    const baseAmount = Math.max(0.01, Number(item.uiBaseAmount) || Number(item.amount) || 1);
    const ratio = amount / baseAmount;
    const patch = {
      amount,
      calories: Math.round((Number(item.uiBaseCalories) || Number(item.calories) || 0) * ratio),
      carbs: Math.round((Number(item.uiBaseCarbs) || Number(item.carbs) || 0) * ratio * 10) / 10,
      protein: Math.round((Number(item.uiBaseProtein) || Number(item.protein) || 0) * ratio * 10) / 10,
      fat: Math.round((Number(item.uiBaseFat) || Number(item.fat) || 0) * ratio * 10) / 10
    };
    Object.keys(patch).forEach(key => {
      this.setData({
        [`messages[${messageIndex}].AI_MESSAGE_PAYLOAD.proposals[${proposalIndex}].payload.items[${foodIndex}].${key}`]:
          patch[key]
      });
    });
  },

  onProposalFoodItemNameInput(e) {
    const messageIndex = Number(e.currentTarget.dataset.index);
    const proposalIndex = Number(e.currentTarget.dataset.proposal);
    const foodIndex = Number(e.currentTarget.dataset.food);
    this.setData({
      [`messages[${messageIndex}].AI_MESSAGE_PAYLOAD.proposals[${proposalIndex}].payload.items[${foodIndex}].name`]:
        e.detail.value
    });
  },

  onProposalFoodCaloriesInput(e) {
    const messageIndex = Number(e.currentTarget.dataset.index);
    const proposalIndex = Number(e.currentTarget.dataset.proposal);
    const foodIndex = Number(e.currentTarget.dataset.food);
    const proposal = this.data.messages[messageIndex].AI_MESSAGE_PAYLOAD.proposals[proposalIndex];
    const item = proposal.payload.items[foodIndex];
    const calories = Math.max(0, Number(e.detail.value) || 0);
    const protein = Math.max(0, Number(item.protein) || 0);
    const fat = Math.max(0, Number(item.fat) || 0);
    const carbs = Math.max(0, Math.round(((calories - protein * 4 - fat * 9) / 4) * 10) / 10);
    const computedCalories = nutritionHelper.calculateCaloriesByMacros(carbs, protein, fat);
    this.setData({
      [`messages[${messageIndex}].AI_MESSAGE_PAYLOAD.proposals[${proposalIndex}].payload.items[${foodIndex}].carbs`]:
        carbs,
      [`messages[${messageIndex}].AI_MESSAGE_PAYLOAD.proposals[${proposalIndex}].payload.items[${foodIndex}].calories`]:
        computedCalories
    });
  },

  openProposalEditor(e) {
    const data = e.currentTarget.dataset;
    const messageIndex = Number(data.index);
    const proposalIndex = Number(data.proposal);
    const foodIndex = data.food === undefined ? -1 : Number(data.food);
    const field = data.field;
    const proposal = this.data.messages[messageIndex].AI_MESSAGE_PAYLOAD.proposals[proposalIndex];
    const value = foodIndex >= 0
      ? proposal.payload.items[foodIndex][field]
      : proposal.payload.profilePatch[field];
    const titleMap = {
      name: "修改食物名称",
      amount: "修改食物份量",
      calories: "修改食物热量"
    };
    const bodyField = (proposal.uiBodyFields || []).find(item => item.key === field);
    this.setData({
      proposalEditor: {
        visible: true,
        title: titleMap[field] || `修改${bodyField ? bodyField.label : "数据"}`,
        value: value === undefined || value === null ? "" : String(value),
        inputType: field === "name" ? "text" : "number",
        messageIndex,
        proposalIndex,
        foodIndex,
        field
      }
    });
  },

  closeProposalEditor() {
    this.setData({ "proposalEditor.visible": false });
  },

  confirmProposalEditor(e) {
    const editor = this.data.proposalEditor;
    const syntheticEvent = {
      currentTarget: {
        dataset: {
          index: editor.messageIndex,
          proposal: editor.proposalIndex,
          food: editor.foodIndex,
          key: editor.field
        }
      },
      detail: { value: e.detail.value }
    };
    if (editor.foodIndex >= 0 && editor.field === "name") {
      this.onProposalFoodItemNameInput(syntheticEvent);
    } else if (editor.foodIndex >= 0 && editor.field === "amount") {
      this.onProposalFoodAmountInput(syntheticEvent);
    } else if (editor.foodIndex >= 0 && editor.field === "calories") {
      this.onProposalFoodCaloriesInput(syntheticEvent);
    } else {
      this.onProposalBodyMetricInput(syntheticEvent);
    }
    this.closeProposalEditor();
  },

  removeProposalFood(e) {
    const messageIndex = Number(e.currentTarget.dataset.index);
    const proposalIndex = Number(e.currentTarget.dataset.proposal);
    const foodIndex = Number(e.currentTarget.dataset.food);
    const proposal = this.data.messages[messageIndex].AI_MESSAGE_PAYLOAD.proposals[proposalIndex];
    const items = (proposal.payload.items || []).filter((item, index) => index !== foodIndex);
    this.setData({
      [`messages[${messageIndex}].AI_MESSAGE_PAYLOAD.proposals[${proposalIndex}].payload.items`]:
        items
    });
  },

  onProposalBodyMetricInput(e) {
    const messageIndex = Number(e.currentTarget.dataset.index);
    const proposalIndex = Number(e.currentTarget.dataset.proposal);
    const key = e.currentTarget.dataset.key;
    this.setData({
      [`messages[${messageIndex}].AI_MESSAGE_PAYLOAD.proposals[${proposalIndex}].payload.profilePatch.${key}`]:
        e.detail.value
    });
  },

  onWorkoutWriteModeChange(e) {
    const messageIndex = Number(e.currentTarget.dataset.index);
    const proposalIndex = Number(e.currentTarget.dataset.proposal);
    const modeIndex = Number(e.detail.value) || 0;
    const modes = ["append", "replace", "tomorrow", "week", "template"];
    const mode = modes[modeIndex] || "append";
    const datePatch = mode === "tomorrow"
      ? this._dateKeyWithOffset(1)
      : this.data.messages[messageIndex].AI_MESSAGE_PAYLOAD.proposals[proposalIndex].uiDate;
    this.setData({
      [`messages[${messageIndex}].AI_MESSAGE_PAYLOAD.proposals[${proposalIndex}].uiWriteModeIndex`]:
        modeIndex,
      [`messages[${messageIndex}].AI_MESSAGE_PAYLOAD.proposals[${proposalIndex}].uiWriteMode`]:
        mode === "tomorrow" ? "append" : mode,
      [`messages[${messageIndex}].AI_MESSAGE_PAYLOAD.proposals[${proposalIndex}].uiWriteModeLabel`]:
        this.data.workoutWriteOptions[modeIndex],
      [`messages[${messageIndex}].AI_MESSAGE_PAYLOAD.proposals[${proposalIndex}].uiDate`]:
        datePatch
    });
  },

  acceptProposal(e) {
    const messageIndex = Number(e.currentTarget.dataset.index);
    const proposalIndex = Number(e.currentTarget.dataset.proposal);
    const message = this.data.messages[messageIndex];
    const proposals = message && message.AI_MESSAGE_PAYLOAD
      ? (message.AI_MESSAGE_PAYLOAD.proposals || [])
      : [];
    const proposal = proposals[proposalIndex];
    if (!proposal || proposal.status !== "pending") return;
    const data = Object.assign({}, proposal.payload || {}, {
      date: proposal.uiDate || this._todayKey()
    });
    if (proposal.type === "dietLog") {
      if (Number(proposal.uiMealIndex) < 0) {
        wx.showToast({ title: "请先选择写入哪一餐", icon: "none" });
        return;
      }
      data.meal = ["breakfast", "lunch", "dinner", "snack"][
        Number(proposal.uiMealIndex)
      ];
      const items = Array.isArray(data.items) ? data.items.slice() : [];
      if (!items.length) {
        wx.showToast({ title: "没有可写入的食物", icon: "none" });
        return;
      }
      if (items.some(item => !String(item.name || "").trim())) {
        wx.showToast({ title: "请先确认食物名称", icon: "none" });
        return;
      }
      data.items = items;
      proposal.uiMeal = data.meal;
    }
    if (proposal.type === "workoutPlan") {
      data.writeMode = proposal.uiWriteMode || data.writeMode || "append";
    }
    proposal.payload = data;
    const draft = aiWriteService.createDraftFromProposal(
      proposal,
      data.recognition && data.recognition.sourceMessageId ||
        message.AI_MESSAGE_ID ||
        `${messageIndex}`
    );
    const confirmed = aiWriteService.confirmAIWriteDraft(
      draft.id,
      proposal.type === "dietLog"
        ? data.meal
        : (proposal.type === "workoutPlan" ? data.writeMode : (data.operation || "profile")),
      proposal.type === "dietLog"
        ? {
            date: data.date,
            mealType: data.meal,
            foods: data.items,
            operation: data.operation || "create",
            replaceMeal: Boolean(data.replaceMeal),
            allowEmpty: Boolean(data.allowEmpty)
          }
        : data
    );
    if (confirmed.validationErrors.length) {
      this.setData({
        [`messages[${messageIndex}].AI_MESSAGE_PAYLOAD.proposals[${proposalIndex}].writeError`]:
          confirmed.validationErrors.join("；"),
        [`messages[${messageIndex}].AI_MESSAGE_PAYLOAD.proposals[${proposalIndex}].draftId`]:
          draft.id
      });
      return;
    }
    const execute = () => this._executeProposalDraft(messageIndex, proposalIndex, draft.id);
    if (proposal.type === "workoutPlan" && data.writeMode === "replace") {
      wx.showModal({
        title: "确认替换训练计划",
        content: "替换后，目标日期原有训练计划会被覆盖。是否继续？",
        confirmText: "确认替换",
        confirmColor: "#D64545",
        success: ({ confirm }) => {
          if (confirm) execute();
        }
      });
      return;
    }
    execute();
  },

  _executeProposalDraft(messageIndex, proposalIndex, draftId) {
    this.setData({
      [`messages[${messageIndex}].AI_MESSAGE_PAYLOAD.proposals[${proposalIndex}].status`]:
        "writing",
      [`messages[${messageIndex}].AI_MESSAGE_PAYLOAD.proposals[${proposalIndex}].draftId`]:
        draftId,
      [`messages[${messageIndex}].AI_MESSAGE_PAYLOAD.proposals[${proposalIndex}].writeError`]:
        ""
    });
    const result = aiWriteService.executeAIWriteDraft(draftId);
    this.setData({
      [`messages[${messageIndex}].AI_MESSAGE_PAYLOAD.proposals[${proposalIndex}].status`]:
        result.status,
      [`messages[${messageIndex}].AI_MESSAGE_PAYLOAD.proposals[${proposalIndex}].writeError`]:
        result.writeResult && result.writeResult.errorMessage || ""
    });
    if (result.status === "success") {
      this._refreshCoachContext();
      const successTitle = result.type === "food_log"
        ? "已写入饮食记录"
        : (result.type === "workout_plan" ? "训练计划已写入" : "身体数据已写入");
      wx.showToast({
        title: successTitle,
        icon: "success"
      });
    }
  },

  retryProposal(e) {
    const messageIndex = Number(e.currentTarget.dataset.index);
    const proposalIndex = Number(e.currentTarget.dataset.proposal);
    const proposal = this.data.messages[messageIndex].AI_MESSAGE_PAYLOAD.proposals[proposalIndex];
    if (!proposal.draftId) return;
    const result = aiWriteService.retryAIWriteDraft(proposal.draftId);
    this.setData({
      [`messages[${messageIndex}].AI_MESSAGE_PAYLOAD.proposals[${proposalIndex}].status`]:
        result.status,
      [`messages[${messageIndex}].AI_MESSAGE_PAYLOAD.proposals[${proposalIndex}].writeError`]:
        result.writeResult && result.writeResult.errorMessage || ""
    });
    if (result.status === "success") this._refreshCoachContext();
  },

  rejectProposal(e) {
    const messageIndex = Number(e.currentTarget.dataset.index);
    const proposalIndex = Number(e.currentTarget.dataset.proposal);
    const proposal = this.data.messages[messageIndex] &&
      this.data.messages[messageIndex].AI_MESSAGE_PAYLOAD &&
      this.data.messages[messageIndex].AI_MESSAGE_PAYLOAD.proposals[proposalIndex];
    if (proposal && proposal.draftId) aiWriteService.cancelAIWriteDraft(proposal.draftId);
    this.setData({
      [`messages[${messageIndex}].AI_MESSAGE_PAYLOAD.proposals[${proposalIndex}].status`]:
        "cancelled"
    });
  },

  _applyLocalProposalPatch(message, pendingProposalRef, intentResult, userMessage) {
    const patchResult = proposalPatch.applyPendingProposalPatch(
      pendingProposalRef && pendingProposalRef.proposal,
      message,
      Object.assign({}, this.data.coachContext || {}, {
        tomorrowKey: this._dateKeyWithOffset(1)
      })
    );
    if (!patchResult.applied) return false;
    const messages = this.data.messages.concat(userMessage || []);
    const targetMessage = Object.assign({}, messages[pendingProposalRef.messageIndex]);
    const payload = Object.assign({}, targetMessage.AI_MESSAGE_PAYLOAD || {});
    const proposals = Array.isArray(payload.proposals) ? payload.proposals.slice() : [];
    proposals[pendingProposalRef.proposalIndex] = this._decorateProposal(patchResult.proposal);
    targetMessage.AI_MESSAGE_PAYLOAD = Object.assign({}, payload, { proposals });
    messages[pendingProposalRef.messageIndex] = targetMessage;
    messages.push(this._decorateMessage({
      AI_MESSAGE_ID: `assistant-patch-${Date.now()}`,
      AI_MESSAGE_ROLE: "assistant",
      AI_MESSAGE_TYPE: patchResult.proposal.type === "workoutPlan"
        ? "training"
        : (patchResult.proposal.type === "profilePatch" ? "profile" : "diet"),
      AI_MESSAGE_CONTENT: proposalBuilder.buildPatchAcknowledgement(patchResult),
      AI_MESSAGE_PAYLOAD: {
        proposals: [],
        intent: intentResult
      },
      local: true
    }));
    this.setData({
      messages,
      inputValue: "",
      selectedImages: [],
      showImageSourceMenu: false,
      requestError: "",
      lastMessage: message,
      lastImages: [],
      conversationSettled: true
    }, () => {
      this._measureComposer(true);
      this._settleConversationBottom();
    });
    return true;
  },

  _handleLocalStructuredIntent(message, intentResult, userMessage) {
    const localResult = agentRecordService.handleLocalIntent(
      message,
      intentResult,
      {
        sourceMessageId: userMessage && userMessage.AI_MESSAGE_ID,
        userProfile: this.data.coachContext && this.data.coachContext.userProfile
      }
    );
    if (!localResult || !localResult.handled) return false;

    const assistantPayload = {
      proposals: localResult.proposal ? [this._decorateProposal(localResult.proposal)] : [],
      intent: intentResult
    };
    const assistant = this._decorateMessage({
      AI_MESSAGE_ID: `assistant-local-${Date.now()}`,
      AI_MESSAGE_ROLE: "assistant",
      AI_MESSAGE_TYPE: localResult.assistantType || "general",
      AI_MESSAGE_CONTENT: localResult.content || "",
      AI_MESSAGE_PAYLOAD: assistantPayload,
      local: true
    });
    const messages = this.data.messages.concat(userMessage || [], assistant);
    this.setData({
      messages,
      inputValue: "",
      selectedImages: [],
      showImageSourceMenu: false,
      requestError: "",
      lastMessage: message,
      lastImages: [],
      sending: false,
      uploading: false,
      presenting: false,
      conversationSettled: true
    }, () => {
      this._measureComposer(true);
      this._settleConversationBottom();
    });
    return true;
  },

  async sendMessage() {
    const typedMessage = String(this.data.inputValue || "").trim();
    const selectedImages = this.data.selectedImages.slice();
    if (
      (!typedMessage && !selectedImages.length) ||
      this.data.sending ||
      this.data.presenting
    ) return;

    const localImages = selectedImages.map(item => item.path);
    const pendingProposalRef = proposalBuilder.getPendingProposal(this.data.messages);
    const inferredQuickAction = this._pendingQuickAction || (
      localImages.length && !typedMessage ? "拍照记饮食" : ""
    );
    const normalizedQuickAction = this._pendingQuickAction || "";
    const message = typedMessage || (
      localImages.length && !normalizedQuickAction
        ? "请先判断这张图片属于哪类记录，再提取可确认保存的信息并生成待确认卡片。"
        : this._buildImplicitImagePrompt(normalizedQuickAction)
    );
    const intentResult = aiIntentService.routeIntent(message, {
      quickAction: normalizedQuickAction,
      hasImages: selectedImages.length > 0,
      pendingProposal: pendingProposalRef && pendingProposalRef.proposal
    });
    this._pendingQuickAction = "";
    const supportResult = this._checkSupportedCoachRequest(message, {
      quickAction: normalizedQuickAction,
      hasImages: selectedImages.length > 0,
      intentResult
    });
    const sourceMessageId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const localUserMessage = {
      AI_MESSAGE_ID: sourceMessageId,
      AI_MESSAGE_ROLE: "user",
      AI_MESSAGE_CONTENT: typedMessage,
      AI_MESSAGE_PAYLOAD: {
        images: localImages,
        quickAction: normalizedQuickAction,
        intent: intentResult
      },
      local: true
    };
    if (
      intentResult.responseMode === "patch_pending_proposal" &&
      pendingProposalRef &&
      this._applyLocalProposalPatch(message, pendingProposalRef, intentResult, localUserMessage)
    ) {
      return;
    }
    if (
      !selectedImages.length &&
      this._handleLocalStructuredIntent(message, intentResult, localUserMessage)
    ) {
      return;
    }
    const isFoodRequest = normalizedQuickAction === "拍照记饮食" ||
      selectedImages.length > 0 ||
      /(吃了|喝了|早餐|午餐|晚餐|加餐|餐食|食物|热量|饮食)/.test(message);
    const recognition = ["food_log_write", "food_analysis_only"].includes(intentResult.intent)
      ? foodRecognitionService.beginRecognition(sourceMessageId, localImages)
      : null;
    const optimistic = this.data.messages.concat({
      AI_MESSAGE_ID: sourceMessageId,
      AI_MESSAGE_ROLE: "user",
      AI_MESSAGE_CONTENT: typedMessage,
      AI_MESSAGE_PAYLOAD: { images: localImages },
      local: true
    });
    optimistic[optimistic.length - 1] = localUserMessage;

    if (!supportResult.supported) {
      const assistant = this._decorateMessage({
        AI_MESSAGE_ID: `assistant-guide-${Date.now()}`,
        AI_MESSAGE_ROLE: "assistant",
        AI_MESSAGE_TYPE: "general",
        AI_MESSAGE_CONTENT: proposalBuilder.buildUnsupportedReply(),
        AI_MESSAGE_PAYLOAD: {
          proposals: [],
          intent: Object.assign({}, intentResult, {
            intent: "unsupported",
            responseMode: "answer_only"
          })
        },
        local: true
      });
      this.setData({
        messages: optimistic,
        inputValue: "",
        selectedImages: [],
        showImageSourceMenu: false,
        sending: false,
        uploading: false,
        requestError: "",
        lastMessage: message,
        lastImages: selectedImages
      }, () => this._presentAssistant(optimistic, assistant));
      return;
    }

    this.setData({
      messages: optimistic,
      inputValue: "",
      selectedImages: [],
      sending: true,
      uploading: selectedImages.length > 0,
      requestError: "",
      conversationSettled: false,
      lastMessage: message,
      lastImages: selectedImages
    }, () => this._measureComposer(true));
    this._startThinkingRotation(selectedImages.length > 0);
    this._measureComposer(true);

    try {
      // Always call the real cloud agent for supported requests.
      // Provider configuration errors are handled by the cloud function response.
      let uploadedImages = [];
      let imageData = [];
      if (localImages.length) {
        const uploadPaths = [];
        for (let index = 0; index < localImages.length; index += 1) {
          const prepared = await this._prepareImageForUpload(localImages[index]);
          uploadPaths.push(prepared);
          imageData.push(await this._imageToDataUri(prepared, 220000));
        }
        try {
          uploadedImages = await cloudHelper.transTempPics(
            uploadPaths,
            "ai/chat/",
            this.data.sessionId || this._todayKey(),
            "vision"
          );
        } catch (uploadError) {
          // Base64 is the model input. Cloud upload is only for durable chat display.
          uploadedImages = [];
          console.warn("AI_IMAGE_CLOUD_UPLOAD_SKIPPED", uploadError);
        }
      }
      this.setData({ uploading: false });

      const runRequest = () => (
        cloudHelper.callCloud("ai/send", {
          sessionId: this.data.sessionId,
          message,
          profile: this._buildAiProfileContext(),
          images: uploadedImages,
          imageData,
          clientMessageId: sourceMessageId,
          recognitionId: recognition && recognition.id || "",
          intent: intentResult
        }, { hint: false }).then(result => result && result.data)
      );
      const timeout = new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error("AI_TIMEOUT")), 65000);
      });
      let res = await Promise.race([runRequest(), timeout]);
      if ((!res || !res.answer) && localImages.length) {
        console.warn("AI_EMPTY_RESPONSE_RETRY", { sourceMessageId, imageCount: localImages.length });
        res = await Promise.race([runRequest(), timeout]);
      }
      if (!res || !res.answer) throw new Error("EMPTY_RESPONSE");
      this._stopThinkingRotation();

      optimistic[optimistic.length - 1].AI_MESSAGE_PAYLOAD.images =
        uploadedImages.length ? uploadedImages : localImages;
      const fallbackAnswer = aiResponseFallback.ensureAssistant(
        res.answer,
        message,
        this.data.coachContext,
        selectedImages.length > 0,
        {
          sourceMessageId,
          recognition,
          intentResult
        }
      );
      fallbackAnswer.payload = Object.assign({}, fallbackAnswer.payload || {}, {
        intent: intentResult
      });
      const assistant = this._ensureVisibleProposalCard(this._decorateMessage({
        AI_MESSAGE_ROLE: "assistant",
        AI_MESSAGE_TYPE: fallbackAnswer.type,
        AI_MESSAGE_CONTENT: this._normalizeAnswerContent(fallbackAnswer.content),
        AI_MESSAGE_PAYLOAD: Object.assign({}, fallbackAnswer.payload || {}, {
          memory: fallbackAnswer.memory || {},
          safety: fallbackAnswer.safety || {},
          model: this._modelLabel(fallbackAnswer.model),
          requestId: fallbackAnswer.requestId || ""
        }),
        local: true
      }), {
        message,
        hasImages: selectedImages.length > 0,
        sourceMessageId,
        recognition,
        intentResult
      });
      this.setData({
        sessionId: res.sessionId || this.data.sessionId,
        sending: false,
        uploading: false
      });
      this._presentAssistant(optimistic, assistant);
    } catch (err) {
      this._stopThinkingRotation();
      const errorMessage = String(err && (err.message || err.msg || err.errMsg) || "");
      let requestError = "发送失败，请稍后重试";
      if (errorMessage === "AI_TIMEOUT") {
        requestError = "响应时间有点长，请重试";
      } else if (errorMessage.includes("IMAGE_ENCODE")) {
        requestError = "手机相册图片转换失败，请尝试截图后重新上传";
      } else if (
        errorMessage.includes("exceed") ||
        errorMessage.includes("too large") ||
        errorMessage.includes("data size") ||
        errorMessage.includes("-504003")
      ) {
        requestError = "图片请求数据过大，请减少图片数量后重试";
      } else if (
        errorMessage.includes("IMAGE_UPLOAD") ||
        errorMessage.includes("IMAGE_TOO_LARGE") ||
        errorMessage.includes("uploadFile") ||
        errorMessage.includes("INVALID_IMAGE")
      ) {
        requestError = errorMessage.includes("TOO_LARGE")
          ? "图片压缩后仍过大，请换一张图片"
          : "图片处理失败，请重新选择后再试";
      } else if (errorMessage.includes("图片")) {
        requestError = errorMessage.slice(0, 120);
      } else if (errorMessage.includes("MIMO_API_KEY")) {
        requestError = "AI 服务尚未配置，请联系管理员";
      } else if (errorMessage.includes("MIMO_")) {
        requestError = errorMessage.replace(/\s*\[[^\]]+\]\s*/g, "：");
      } else if (errorMessage) {
        requestError = errorMessage.slice(0, 120);
      }
      console.error("AI_SEND_FAILED", err);
      this.setData({
        sending: false,
        uploading: false
      });
      if (selectedImages.length > 0) {
        const fallbackAssistant = this._ensureVisibleProposalCard(this._decorateMessage({
          AI_MESSAGE_ID: `assistant-fallback-${Date.now()}`,
          AI_MESSAGE_ROLE: "assistant",
          AI_MESSAGE_TYPE: "general",
          AI_MESSAGE_CONTENT: errorMessage === "EMPTY_RESPONSE"
            ? "我这次没有顺利读出图片内容。你可以直接点重试，或者补一句这顿饭里大概有什么，我会继续帮你整理成可保存的记录。"
            : "这次图片识别没有完全成功。你可以直接点重试，或者补一句这顿饭里有什么，我继续帮你整理。",
          AI_MESSAGE_PAYLOAD: {
            intent: intentResult
          },
          local: true
        }), {
          message,
          hasImages: true,
          sourceMessageId,
          recognition,
          intentResult
        });
        this._presentAssistant(optimistic, fallbackAssistant);
      } else {
        this.setData({ requestError });
      }
    }
  },

  retryLastMessage() {
    if (!this.data.lastMessage || this.data.sending) return;
    const messages = this.data.messages.slice();
    const last = messages[messages.length - 1];
    if (last && last.local && last.AI_MESSAGE_ROLE === "user") messages.pop();
    this.setData({
      messages,
      inputValue: this.data.lastMessage,
      selectedImages: this.data.lastImages,
      requestError: ""
    }, () => this.sendMessage());
  },

  async _loadMessages() {
    if (!this.data.sessionId) return;
    try {
      const messages = await cloudHelper.callCloudData("ai/messages", {
        sessionId: this.data.sessionId
      }, { hint: false });
      this.setData({
        messages: (messages || []).map(item => this._decorateMessage(item)),
        conversationSettled: true
      }, () => {
        this._measureComposer(true);
        this._settleConversationBottom();
      });
    } catch (err) {
      this.setData({ requestError: "历史消息加载失败" });
    }
  },

  openHistory() {
    wx.navigateTo({ url: "../history/ai_history" });
  },

  startNewConversation() {
    if (!this.data.messages.length && !this.data.inputValue && !this.data.selectedImages.length) {
      this.newConversation();
      return;
    }
    wx.showModal({
      title: "开始新对话",
      content: "当前对话会保留在历史记录中。",
      confirmText: "新对话",
      success: ({ confirm }) => {
        if (confirm) this.newConversation();
      }
    });
  },

  openCoachSettings() {
    wx.navigateTo({ url: "../../my/settings/settings" });
  },

  _checkSupportedCoachRequest(message, options = {}) {
    const text = String(message || "");
    const quickAction = String(options.quickAction || "");
    const intent = options.intentResult || {};
    if (quickAction) return { supported: true, reason: "quick_action" };
    if (options.hasImages && intent.intent !== "unsupported") {
      return { supported: true, reason: "image_input" };
    }
    if (intent.supported) return { supported: true, reason: "intent_router" };
    return { supported: false, reason: intent.intent || text || "unsupported" };
    if (options.hasImages) return { supported: true, reason: "image_input" };
    if ([
      "diet_image_recognition",
      "diet_text_logging",
      "diet_advice",
      "workout_plan_generate",
      "workout_log_record",
      "modify_pending_proposal",
      "body_data_recognition",
      "body_data_update",
      "body_status_evaluation"
    ].includes(intent.intent)) {
      return { supported: true, reason: "intent_router" };
    }
    const supportedPattern = /(饮食记录|记录饮食|拍照记饮食|吃了|喝了|早餐|午餐|晚餐|加餐|饮食建议|吃什么|热量|蛋白质|训练计划|计划制定|安排训练|居家训练|训练记录|记录训练|练腿|练胸|练背|练肩|组|次数|修改计划|改成|身体分析|体重|体脂|BMI|身体变化|胖吗|瘦吗)/;
    return { supported: supportedPattern.test(text), reason: "local_supported_pattern" };
  },

  _buildUnsupportedCoachReply() {
    return proposalBuilder.buildUnsupportedReply();
    return [
      "我现在先专注处理这几类运动健康任务：饮食记录、饮食建议、训练计划制定、训练记录、计划修改和身体分析。",
      "你可以这样问：",
      "1. 帮我记录午餐：米饭、鸡胸肉和青菜。",
      "2. 根据今天记录，生成今日饮食建议。",
      "3. 给我安排一个 30 分钟居家练腿计划。",
      "4. 我今天做了深蹲 4 组，每组 12 次，帮我记录。",
      "5. 把刚才的训练计划改成 6 组。",
      "6. 我 180cm、80kg，帮我做身体分析。"
    ].join("\n");
  },

  _loadCoachProfile() {
    const coach = Object.assign({}, DEFAULT_COACH, wx.getStorageSync(COACH_KEY) || {});
    const name = String(coach.name || DEFAULT_COACH.name).trim();
    coach.name = name;
    coach.initials = /^[A-Za-z]/.test(name)
      ? name.slice(0, 2).toUpperCase()
      : (name.slice(0, 1) || "AI");
    this.setData({ coach });
  },

  async _loadProviderStatus() {
    try {
      const status = await cloudHelper.callCloudData("ai/status", {}, { hint: false });
      const configured = Boolean(status && status.configured);
        this.setData({
          providerConfigured: configured,
          providerStatus: configured
          ? "可以开始"
          : "暂时不可用"
        });
      } catch (err) {
        this.setData({
          providerConfigured: false,
          providerStatus: "暂时不可用"
        });
      }
  },

  newConversation() {
    if (this._answerTimer) {
      clearTimeout(this._answerTimer);
      this._answerTimer = null;
    }
    this._stopThinkingRotation();
    this.setData({
      sessionId: "",
      messages: [],
      inputValue: "",
      selectedImages: [],
      showImageSourceMenu: false,
      requestError: "",
      lastMessage: "",
      lastImages: [],
      sending: false,
      presenting: false,
      conversationSettled: false
    });
    this._pendingQuickAction = "";
  },

  clearConversation() {
    if (!this.data.messages.length) return;
    wx.showModal({
      title: "清空当前页面",
      content: "历史会话仍可在历史对话中查看。",
      confirmText: "清空",
      confirmColor: "#D64545",
      success: ({ confirm }) => {
        if (confirm) this.newConversation();
      }
    });
  },

  showMessageMenu(e) {
    const index = Number(e.currentTarget.dataset.index);
    const message = this.data.messages[index];
    if (!message) return;
    wx.showActionSheet({
      itemList: ["复制文字", "删除本地显示"],
      success: ({ tapIndex }) => {
        if (tapIndex === 0) {
          wx.setClipboardData({ data: message.AI_MESSAGE_CONTENT || "" });
        } else {
          this.setData({
            messages: this.data.messages.filter((item, itemIndex) => itemIndex !== index)
          });
        }
      }
    });
  },

  onComposerFocus() {
    this._scrollBottom();
  },

  onComposerKeyboardHeightChange(e) {
    const keyboardHeight = Math.max(0, Number(e.detail && e.detail.height) || 0);
    this.setData({ keyboardHeight }, () => {
      this._setTabBarHidden(keyboardHeight > 0);
      this._measureComposer(Boolean(keyboardHeight));
    });
  },

  onComposerBlur() {
    setTimeout(() => {
      if (!this.data.keyboardHeight) this._setTabBarHidden(false);
    }, 80);
  },

  _startPlaceholderRotation() {
    const placeholders = [
      "说说刚吃了什么",
      "发一张餐食照片",
      "记录体重体脂",
      "今天想练哪里"
    ];
    this._placeholderIndex = 0;
    this._placeholderTimer = setInterval(() => {
      this._placeholderIndex = (this._placeholderIndex + 1) % placeholders.length;
      this.setData({ placeholderText: placeholders[this._placeholderIndex] });
    }, 3000);
  },

  _startThinkingRotation(hasImages) {
    this._stopThinkingRotation();
    const stages = hasImages
      ? ["读取图片", "分析食物类型", "估算营养素", "整理建议"]
      : ["理解问题", "结合历史记录", "组织建议"];
    this._thinkingIndex = 0;
    this.setData({ thinkingText: stages[0] });
    this._thinkingTimer = setInterval(() => {
      this._thinkingIndex = (this._thinkingIndex + 1) % stages.length;
      this.setData({ thinkingText: stages[this._thinkingIndex] });
    }, 1100);
  },

  _stopThinkingRotation() {
    if (this._thinkingTimer) {
      clearInterval(this._thinkingTimer);
      this._thinkingTimer = null;
    }
  },

  _presentAssistant(baseMessages, assistant) {
    if (this._answerTimer) clearTimeout(this._answerTimer);

    const fullContent = String(assistant.AI_MESSAGE_CONTENT || "").trim();
    const chunks = this._splitAnswerChunks(fullContent);
    const messageIndex = baseMessages.length;
    const displayMessage = Object.assign({}, assistant, {
      AI_MESSAGE_CONTENT: "",
      // Hide structured cards while text is streaming so the bubble grows with the generated text.
      AI_MESSAGE_PAYLOAD: { streaming: true }
    });

    this._lastStreamingScrollAt = 0;
    this.setData({
      messages: baseMessages.concat(displayMessage),
      presenting: true,
      conversationSettled: false
    }, () => {
      this._vibrateShort();
      this._measureComposer(true);
    });

    let index = 0;
    let displayed = "";

    const reveal = () => {
      if (index >= chunks.length) {
        this.setData({
          [`messages[${messageIndex}].AI_MESSAGE_CONTENT`]: fullContent || displayed,
          [`messages[${messageIndex}].AI_MESSAGE_PAYLOAD`]: assistant.AI_MESSAGE_PAYLOAD,
          presenting: false,
          conversationSettled: true
        }, () => {
          this._measureComposer(false);
          this._settleConversationBottom();
        });
        this._answerTimer = null;
        return;
      }

      const chunk = chunks[index];
      displayed += chunk;
      index += 1;

      this.setData({
        [`messages[${messageIndex}].AI_MESSAGE_CONTENT`]: displayed
      }, () => {
        this._scrollBottomDuringStreaming();
      });

      this._answerTimer = setTimeout(reveal, this._getRevealDelay(chunk, displayed));
    };

    setTimeout(reveal, 220);
  },

  _splitAnswerChunks(content) {
    if (!content) return [""];

    const text = String(content);
    const chunks = [];
    let buffer = "";

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      buffer += char;

      const isNewLine = char === "\n";
      const isSentenceEnd = /[。！？.!?]/.test(char);
      const isSoftPunctuation = /[，,、；：:]/.test(char);
      const targetLength = isSoftPunctuation ? 8 : 10;

      if (isNewLine || isSentenceEnd || buffer.length >= targetLength) {
        chunks.push(buffer);
        buffer = "";
      }
    }

    if (buffer) chunks.push(buffer);
    return chunks.length ? chunks : [content];
  },

  _getRevealDelay(chunk, displayed) {
    const text = String(chunk || "");
    if (/\n$/.test(text)) return 180;
    if (/[。！？.!?]$/.test(text)) return 170;
    if (/[，,、；：:]$/.test(text)) return 115;
    return displayed.length < 60 ? 92 : 76;
  },

  _buildImplicitImagePrompt(quickAction) {
    if (quickAction === "记录身体变化") {
      return "请识别这张身体数据图片，提取体重、体脂、围度等信息，并生成可确认保存的身体数据草稿。";
    }
    return "请识别这张餐食图片，告诉我食物名称和大致热量，并生成可确认保存的饮食记录。";
  },

  _looksLikeWorkoutProposal(text, intentResult) {
    const source = `${String(text || "")} ${String(intentResult && intentResult.intent || "")} ${String(intentResult && intentResult.responseMode || "")}`;
    const hasWorkoutSignal = /(训练计划|训练安排|居家训练|健身|动作|组\s*[×xX]|组\s*\*|休息\s*\d+|俯卧撑|深蹲|平板支撑|卷腹|弓步|硬拉|卧推|划船|提踵)/.test(source);
    const hasDietSignal = /(饮食记录|餐食|食物|早餐|午餐|晚餐|加餐|拍照记饮食|吃了什么|营养|蛋白质|碳水|脂肪)/.test(source);
    // If a message clearly asks to save a workout/training plan, training must win
    // even when the generated plan contains estimated kcal.
    return hasWorkoutSignal && (!hasDietSignal || /(训练计划|训练安排|居家训练|动作|组\s*[×xX]|休息\s*\d+)/.test(source));
  },

  _buildWorkoutExercisesFromText(text) {
    const content = String(text || "");
    const lines = content
      .split(/\n|。|；|;/)
      .map(line => line.trim())
      .filter(Boolean);
    const exercises = [];

    lines.forEach(line => {
      if (!/(组|次|休息|俯卧撑|深蹲|平板支撑|卷腹|弓步|提踵|开合跳|波比|卧推|划船|硬拉)/.test(line)) return;
      let clean = line.replace(/^\s*\d+[\.、]\s*/, "").trim();
      let name = clean.split(/[：:]/)[0].trim();
      name = name.replace(/^[\-•]\s*/, "").trim();
      if (!name || /^(预计消耗|请在下方|保存|确认)/.test(name)) return;
      if (name.length > 18) name = name.slice(0, 18);

      const setMatch = clean.match(/(\d+)\s*组/);
      const repsMatch = clean.match(/[×xX*]\s*(\d+)/) || clean.match(/(\d+)\s*次/);
      const setCount = Math.min(8, Math.max(1, Number(setMatch && setMatch[1]) || 3));
      const reps = repsMatch && repsMatch[1] ? String(repsMatch[1]) : "10";
      const sets = Array.from({ length: setCount }).map(() => ({
        weight: "",
        reps
      }));
      if (!exercises.some(item => item.name === name)) exercises.push({ name, sets });
    });

    const sanitizedExercises = validators.sanitizeWorkoutExercises(exercises);
    if (sanitizedExercises.length) return sanitizedExercises;
    return [{
      name: "训练计划（请先修改动作）",
      sets: [{ weight: "", reps: "10" }]
    }];
  },

  _buildManualProposalFallback(payload, options) {
    const sourcePayload = Object.assign({}, payload || {});
    const intentResult = options && options.intentResult || {};
    const sourceText = [
      sourcePayload.content,
      sourcePayload.answer,
      sourcePayload.text,
      options && options.message,
      sourcePayload.summary
    ].filter(Boolean).join("\n");

    if (intentResult.intent === "body_data_recognition") {
      const profilePatch = Object.assign(
        {},
        sourcePayload.profilePatch || {},
        sourcePayload.memory && sourcePayload.memory.profilePatch || {}
      );
      if (!Object.keys(profilePatch).length) return null;
      return this._decorateProposal({
        id: `manual-body-${options.sourceMessageId || Date.now()}`,
        type: "profilePatch",
        status: "pending",
        summary: "已整理出一张待确认的身体数据卡片",
        payload: {
          profilePatch
        }
      });
    }

    if (this._looksLikeWorkoutProposal(sourceText, intentResult) || sourcePayload.forceWorkoutProposal) {
      return this._decorateProposal({
        id: `manual-workout-${options && options.sourceMessageId || Date.now()}`,
        type: "workoutPlan",
        status: "pending",
        summary: "我先给你建了一条待确认的训练计划",
        payload: {
          date: "",
          exercises: this._buildWorkoutExercisesFromText(sourceText),
          note: sourceText
        }
      });
    }

    return this._decorateProposal({
      id: `manual-food-${options && options.sourceMessageId || Date.now()}`,
      type: "dietLog",
      status: "pending",
      summary: "我先给你建了一条待确认的饮食记录",
      payload: {
        date: "",
        meal: "",
        items: [{
          name: "图片餐食（请先修改名称）",
          amount: 1,
          unit: "份",
          calories: Math.max(0, Number(sourcePayload.calories) || 0),
          carbs: Math.max(0, Number(sourcePayload.carbs) || 0),
          protein: Math.max(0, Number(sourcePayload.protein) || 0),
          fat: Math.max(0, Number(sourcePayload.fat) || 0),
          confidence: 0.3
        }]
      }
    });
  },

  _ensureVisibleProposalCard(message, options) {
    const source = message || {};
    const payload = Object.assign({}, source.AI_MESSAGE_PAYLOAD || {});
    const intentResult = options && options.intentResult;
    const existingProposals = validators.filterProposalList(
      intentResult || payload.intent || {},
      payload.proposals || []
    );
    if (existingProposals.length) {
      return this._decorateMessage(Object.assign({}, source, {
        AI_MESSAGE_PAYLOAD: Object.assign({}, payload, {
          proposals: existingProposals,
          intent: payload.intent || intentResult || {}
        })
      }));
    }
    const canCreateDietProposal = validators.proposalTypeMatchesIntent(intentResult || {}, "dietLog");
    const canCreateWorkoutProposal = validators.proposalTypeMatchesIntent(intentResult || {}, "workoutPlan");
    const canCreateProfileProposal = validators.proposalTypeMatchesIntent(intentResult || {}, "profilePatch");
    const sourceLooksLikeWorkout = this._looksLikeWorkoutProposal(
      `${source.AI_MESSAGE_CONTENT || ""}
${options && options.message || ""}`,
      intentResult
    );
    const shouldForceProposal = (
      canCreateDietProposal &&
      (
        Boolean(options && options.hasImages) ||
        source.AI_MESSAGE_TYPE === "diet" ||
        Number(payload.calories)
      )
    ) || (
      canCreateWorkoutProposal &&
      (source.AI_MESSAGE_TYPE === "training" || sourceLooksLikeWorkout)
    ) || (
      canCreateProfileProposal &&
      Boolean(payload.memory && payload.memory.profilePatch && Object.keys(payload.memory.profilePatch).length)
    );
    if (intentResult && intentResult.responseMode !== "generate_proposal" && !shouldForceProposal) {
      return source;
    }
    const repaired = aiResponseFallback.ensureAssistant(
      {
        type: source.AI_MESSAGE_TYPE || "general",
        content: source.AI_MESSAGE_CONTENT || "",
        payload
      },
      options && options.message,
      this.data.coachContext,
      Boolean(options && options.hasImages),
      {
        sourceMessageId: options && options.sourceMessageId,
        recognition: options && options.recognition,
        intentResult
      }
    );
    const repairedPayload = Object.assign({}, repaired.payload || {}, {
      memory: payload.memory || repaired.memory || {},
      safety: payload.safety || repaired.safety || {},
      model: payload.model || repaired.model || "",
      requestId: payload.requestId || repaired.requestId || "",
      intent: payload.intent || intentResult || {}
    });
    const decorated = this._decorateMessage(Object.assign({}, source, {
      AI_MESSAGE_TYPE: repaired.type || source.AI_MESSAGE_TYPE,
      AI_MESSAGE_CONTENT: this._normalizeAnswerContent(repaired.content || source.AI_MESSAGE_CONTENT),
      AI_MESSAGE_PAYLOAD: repairedPayload
    }));
    const finalPayload = Object.assign({}, decorated.AI_MESSAGE_PAYLOAD || {});
    const filteredProposals = validators.filterProposalList(
      intentResult || finalPayload.intent || {},
      finalPayload.proposals || []
    );
    if (filteredProposals.length) {
      return Object.assign({}, decorated, {
        AI_MESSAGE_PAYLOAD: Object.assign({}, finalPayload, {
          proposals: filteredProposals
        })
      });
    }
    const decoratedLooksLikeWorkout = this._looksLikeWorkoutProposal(
      `${decorated.AI_MESSAGE_CONTENT || ""}
${options && options.message || ""}`,
      intentResult
    );
    const shouldCreateLocalProposal = (
      canCreateDietProposal &&
      (
        Boolean(options && options.hasImages) ||
        decorated.AI_MESSAGE_TYPE === "diet" ||
        Number(finalPayload.calories)
      )
    ) || (
      canCreateWorkoutProposal &&
      (decorated.AI_MESSAGE_TYPE === "training" || decoratedLooksLikeWorkout)
    ) || (
      canCreateProfileProposal &&
      Boolean(finalPayload.memory && finalPayload.memory.profilePatch && Object.keys(finalPayload.memory.profilePatch).length)
    );
    if (shouldCreateLocalProposal) {
      const rebuiltProposal = this._buildManualProposalFallback(Object.assign({}, finalPayload, {
        content: decorated.AI_MESSAGE_CONTENT,
        forceWorkoutProposal: decoratedLooksLikeWorkout
      }), options);
      if (rebuiltProposal) {
        return Object.assign({}, decorated, {
          AI_MESSAGE_TYPE: decorated.AI_MESSAGE_TYPE || (
            rebuiltProposal.type === "profilePatch" ? "profile" : (
              rebuiltProposal.type === "workoutPlan" ? "training" : "diet"
            )
          ),
          AI_MESSAGE_PAYLOAD: Object.assign({}, finalPayload, {
            proposals: [rebuiltProposal]
          })
        });
      }
      if (!canCreateDietProposal || (intentResult && intentResult.intent === "body_data_recognition")) {
        return decorated;
      }
      const manualProposal = this._decorateProposal({
        id: `manual-food-${options.sourceMessageId || Date.now()}`,
        type: "dietLog",
        status: "pending",
        summary: "我先给你建了一条待确认的饮食记录",
        payload: {
          date: "",
          meal: "",
          items: [{
            name: "图片餐食（请先修改名称）",
            amount: 1,
            unit: "份",
            calories: Math.max(0, Number(finalPayload.calories) || 0),
            carbs: Math.max(0, Number(finalPayload.carbs) || 0),
            protein: Math.max(0, Number(finalPayload.protein) || 0),
            fat: Math.max(0, Number(finalPayload.fat) || 0),
            confidence: 0.3
          }]
        }
      });
      return Object.assign({}, decorated, {
        AI_MESSAGE_TYPE: decorated.AI_MESSAGE_TYPE || "diet",
        AI_MESSAGE_PAYLOAD: Object.assign({}, finalPayload, {
          proposals: [manualProposal]
        })
      });
    }
    return decorated;
  },

  _getRecordSuggestion(message) {
    if (!message) return null;
    const payload = message.AI_MESSAGE_PAYLOAD || {};
    const direct = payload.recordSuggestion;
    const routedIntent = payload.intent && typeof payload.intent === "object"
      ? payload.intent
      : {};
    const typeMap = {
      diet: "dietLog",
      training: "workoutPlan",
      profile: "profilePatch"
    };
    if (direct && direct.kind && direct.kind !== "none") {
      const directType = typeMap[direct.kind];
      if (!directType || validators.proposalTypeMatchesIntent(routedIntent, directType)) {
        return direct;
      }
      return null;
    }
    if (!validators.getAllowedProposalTypes(routedIntent).length) return null;
    const memory = payload.memory || {};
    if (
      memory.profilePatch &&
      Object.keys(memory.profilePatch).length &&
      validators.proposalTypeMatchesIntent(routedIntent, "profilePatch")
    ) {
      return { kind: "profile", profilePatch: memory.profilePatch };
    }
    if (
      message.AI_MESSAGE_TYPE === "diet" &&
      Number(payload.calories) &&
      validators.proposalTypeMatchesIntent(routedIntent, "dietLog")
    ) {
      return {
        kind: "diet",
        items: [{
          name: "AI 饮食估算",
          calories: nutritionHelper.calculateFoodCalories(payload),
          protein: payload.protein,
          carbs: payload.carbs,
          fat: payload.fat
        }]
      };
    }
    if (
      message.AI_MESSAGE_TYPE === "training" &&
      Array.isArray(payload.days) &&
      validators.proposalTypeMatchesIntent(routedIntent, "workoutPlan")
    ) {
      return {
        kind: "training",
        exercises: payload.days.flatMap(day => (
          (day.actions || []).map(action => ({
            name: String(action).split(/[，,：:]/)[0] || day.name || "训练动作",
            subtitle: action,
            sets: [{ weight: "", reps: "10" }]
          }))
        ))
      };
    }
    return null;
  },

  _decorateMessage(message) {
    if (!message || message.AI_MESSAGE_ROLE !== "assistant") return message;
    const payload = Object.assign({}, message.AI_MESSAGE_PAYLOAD || {});
    if (message.AI_MESSAGE_TYPE === "diet" && nutritionHelper.hasMacroData(payload)) {
      payload.calories = nutritionHelper.calculateFoodCalories(payload);
    }
    let proposals = Array.isArray(payload.proposals)
      ? payload.proposals.slice()
      : [];
    const routedIntent = payload.intent && typeof payload.intent === "object"
      ? payload.intent
      : null;
    proposals = validators.filterProposalList(routedIntent || {}, proposals);
    const allowProposal = !routedIntent ||
      validators.getAllowedProposalTypes(routedIntent).length > 0;
    if (!allowProposal) proposals = [];
    if (allowProposal && !proposals.length) {
      const suggestion = this._getRecordSuggestion(message);
      if (suggestion) {
        const typeMap = {
          diet: "dietLog",
          training: "workoutPlan",
          profile: "profilePatch"
        };
        const proposalType = typeMap[suggestion.kind];
        if (!proposalType || !validators.proposalTypeMatchesIntent(routedIntent || {}, proposalType)) {
          proposals = [];
          return Object.assign({}, message, {
            AI_MESSAGE_PAYLOAD: Object.assign({}, payload, { proposals })
          });
        }
        proposals = [{
          id: `local-${message.AI_MESSAGE_ID || Date.now()}`,
          type: proposalType,
          status: "pending",
          summary: suggestion.kind === "diet"
            ? "将这条饮食信息写入记录"
            : (suggestion.kind === "training"
              ? "将这套动作写入训练计划"
              : "将身体数据同步到个人信息"),
          payload: suggestion
        }];
      }
    }
    proposals = proposals.map(proposal => this._decorateProposal(proposal));
    return Object.assign({}, message, {
      AI_MESSAGE_PAYLOAD: Object.assign({}, payload, { proposals })
    });
  },

  _decorateProposal(proposal) {
    let data = proposal && proposal.payload || {};
    if (proposal && proposal.type === "workoutPlan") {
      data = Object.assign({}, data, {
        exercises: validators.sanitizeWorkoutExercises(data.exercises)
      });
    }
    const meals = ["breakfast", "lunch", "dinner", "snack"];
    const mealIndex = meals.indexOf(data.meal);
    const existingDraft = proposal && proposal.id
      ? aiWriteService.getDraft(proposal.id)
      : null;
    const persistedStatus = existingDraft && [
      "writing",
      "success",
      "failed",
      "cancelled"
    ].includes(existingDraft.status)
      ? existingDraft.status
      : "";
    const profilePatch = data.profilePatch || {};
    const uiBodyFields = bodyMetricsService.FIELD_DEFINITIONS
      .filter(field => profilePatch[field.key] !== undefined)
      .map(field => Object.assign({}, field, { value: profilePatch[field.key] }));
    const writeModes = ["append", "replace", "tomorrow", "week", "template"];
    const resolvedWriteMode = data.writeMode || "append";
    const resolvedWriteModeIndex = Math.max(0, writeModes.indexOf(resolvedWriteMode));
    return Object.assign({}, proposal, {
      // Only the local confirmation card may execute a write operation.
      status: persistedStatus || (
        proposal && proposal.status === "cancelled" ? "cancelled" : "pending"
      ),
      draftId: existingDraft ? existingDraft.id : "",
      writeError: existingDraft && existingDraft.writeResult
        ? existingDraft.writeResult.errorMessage || ""
        : "",
      uiDate: /^\d{4}-\d{2}-\d{2}$/.test(String(data.date || ""))
        ? data.date
        : this._todayKey(),
      uiMealIndex: mealIndex,
      uiMealPickerIndex: mealIndex >= 0 ? mealIndex : 0,
      uiMealLabel: mealIndex >= 0 ? this.data.mealOptions[mealIndex] : "请选择",
      uiFoodName: data.items && data.items[0]
        ? String(data.items[0].name || "")
        : "",
      uiWriteModeIndex: resolvedWriteModeIndex,
      uiWriteMode: resolvedWriteMode === "tomorrow" ? "append" : resolvedWriteMode,
      uiWriteModeLabel: this.data.workoutWriteOptions[resolvedWriteModeIndex] || this.data.workoutWriteOptions[0],
      uiBodyFields,
      payload: Object.assign({}, data, {
        items: (data.items || []).map(item => Object.assign({}, item, {
          amount: Math.max(0, Number(item.amount) || 1),
          unit: item.unit || "份",
          uiBaseAmount: Math.max(0, Number(item.amount) || 1),
          uiBaseCalories: nutritionHelper.calculateFoodCalories(item),
          uiBaseCarbs: Math.max(0, Number(item.carbs) || 0),
          uiBaseProtein: Math.max(0, Number(item.protein) || 0),
          uiBaseFat: Math.max(0, Number(item.fat) || 0)
        }))
      })
    });
  },

  _todayKey() {
    const date = new Date();
    const pad = value => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  },

  _dateKeyWithOffset(offset) {
    const date = new Date();
    date.setDate(date.getDate() + Number(offset || 0));
    const pad = value => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  },

  _buildAiProfileContext() {
    return this.data.coachContext || coachContextService.buildCoachContext();
  },

  _refreshCoachContext() {
    const context = coachContextService.buildCoachContext();
    this.setData({
      coachContext: context,
      proactiveGreeting: coachContextService.buildProactiveGreeting(context)
    });
  },

  async _prepareImageForUpload(path) {
    const maxBytes = 900 * 1024;
    const originalSize = await this._getFileSize(path);
    if (originalSize > 0 && originalSize <= maxBytes) return path;
    const attempts = [
      { quality: 72, width: 1600 },
      { quality: 62, width: 1280 },
      { quality: 52, width: 1024 },
      { quality: 42, width: 800 },
      { quality: 32, width: 640 },
      { quality: 24, width: 480 }
    ];
    let smallest = "";
    let smallestSize = Number.MAX_SAFE_INTEGER;
    for (const attempt of attempts) {
      const compressed = await this._compressImageToFile(path, attempt);
      const size = await this._getFileSize(compressed);
      if (size > 0 && size < smallestSize) {
        smallest = compressed;
        smallestSize = size;
      }
      if (size > 0 && size <= maxBytes) return compressed;
    }
    if (smallest && smallestSize <= 2 * 1024 * 1024) return smallest;
    throw new Error("IMAGE_TOO_LARGE");
  },

  _compressImageToFile(path, { quality, width }) {
    return new Promise((resolve, reject) => {
      wx.getImageInfo({
        src: path,
        success: info => {
          const originalWidth = Number(info.width) || width;
          const originalHeight = Number(info.height) || width;
          const targetWidth = Math.min(width, originalWidth);
          const targetHeight = Math.max(1, Math.round(originalHeight * targetWidth / originalWidth));
          wx.compressImage({
            src: path,
            quality,
            compressedWidth: targetWidth,
            compressedHeight: targetHeight,
            success: ({ tempFilePath }) => resolve(tempFilePath || path),
            fail: () => {
              wx.compressImage({
                src: path,
                quality,
                success: ({ tempFilePath }) => resolve(tempFilePath || path),
                fail: () => reject(new Error("IMAGE_COMPRESS_FAILED"))
              });
            }
          });
        },
        fail: () => reject(new Error("IMAGE_INFO_FAILED"))
      });
    });
  },

  _getFileSize(path) {
    return new Promise(resolve => {
      wx.getFileSystemManager().getFileInfo({
        filePath: path,
        success: ({ size }) => resolve(Number(size) || 0),
        fail: () => resolve(0)
      });
    });
  },

  async _imageToDataUri(path, maxBase64Length) {
    const attempts = [
      { quality: 58, width: 1280 },
      { quality: 46, width: 960 },
      { quality: 34, width: 720 },
      { quality: 24, width: 540 },
      { quality: 16, width: 360 }
    ];
    for (const attempt of attempts) {
      const dataUri = await this._compressImageToDataUri(path, attempt);
      if (dataUri.length <= maxBase64Length + 24) return dataUri;
    }
    throw new Error("IMAGE_TOO_LARGE");
  },

  _compressImageToDataUri(path, { quality, width }) {
    return new Promise((resolve, reject) => {
      wx.getImageInfo({
        src: path,
        success: info => {
          const originalWidth = Number(info.width) || width;
          const originalHeight = Number(info.height) || width;
          const targetWidth = Math.min(width, originalWidth);
          const targetHeight = Math.max(1, Math.round(originalHeight * targetWidth / originalWidth));
          wx.compressImage({
            src: path,
            quality,
            compressedWidth: targetWidth,
            compressedHeight: targetHeight,
            success: ({ tempFilePath }) => {
              wx.getFileSystemManager().readFile({
                filePath: tempFilePath || path,
                encoding: "base64",
                success: ({ data }) => {
                  const base64 = String(data || "");
                  if (!base64) return reject(new Error("IMAGE_ENCODE_FAILED"));
                  resolve(`data:image/jpeg;base64,${base64}`);
                },
                fail: () => reject(new Error("IMAGE_ENCODE_FAILED"))
              });
            },
            fail: () => {
              wx.compressImage({
                src: path,
                quality,
                success: ({ tempFilePath }) => {
                  wx.getFileSystemManager().readFile({
                    filePath: tempFilePath || path,
                    encoding: "base64",
                    success: ({ data }) => {
                      const base64 = String(data || "");
                      if (!base64) return reject(new Error("IMAGE_ENCODE_FAILED"));
                      resolve(`data:image/jpeg;base64,${base64}`);
                    },
                    fail: () => reject(new Error("IMAGE_ENCODE_FAILED"))
                  });
                },
                fail: () => reject(new Error("IMAGE_COMPRESS_FAILED"))
              });
            }
          });
        },
        fail: () => reject(new Error("IMAGE_INFO_FAILED"))
      });
    });
  },

  _modelLabel(model) {
    const value = String(model || "").toLowerCase();
    if (value.includes("flash")) return "MiMo-V2-Flash";
    return value ? "MiMo-V2.5" : "";
  },

  _readImageAsDataUri(path) {
    return new Promise((resolve, reject) => {
      wx.getFileSystemManager().readFile({
        filePath: path,
        encoding: "base64",
        success: ({ data }) => {
          const base64 = String(data || "");
          if (!base64) return reject(new Error("IMAGE_ENCODE_FAILED"));
          const lowerPath = String(path || "").toLowerCase();
          const mime = lowerPath.includes(".png")
            ? "image/png"
            : (lowerPath.includes(".webp") ? "image/webp" : "image/jpeg");
          resolve(`data:${mime};base64,${base64}`);
        },
        fail: () => reject(new Error("IMAGE_ENCODE_FAILED"))
      });
    });
  },

  _setTabBarHidden(hidden) {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar && tabBar.data.hidden !== hidden) tabBar.setData({ hidden });
  },

  _vibrateShort() {
    if (!wx.vibrateShort) return;
    try {
      wx.vibrateShort({ type: "light" });
    } catch (err) {
      wx.vibrateShort();
    }
  },

  _normalizeAnswerContent(content) {
    let text = String(content || "").trim();
    if (/^\s*\{/.test(text) && /"content"\s*:/.test(text)) {
      const match = text.match(/"content"\s*:\s*"((?:\\.|[^"\\])*)"/);
      if (match) {
        try {
          text = JSON.parse(`"${match[1]}"`);
        } catch (err) {
          text = match[1];
        }
      }
    }
    return text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .trim();
  },

  _scrollBottom(smooth = false) {
    this._scrollSequence = (this._scrollSequence || 0) + 1;
    this.setData({
      scrollIntoView: "",
      scrollTop: 1000000 + this._scrollSequence,
      scrollWithAnimation: Boolean(smooth)
    });
  },

  _scrollBottomByMeasure(smooth = false) {
    const query = wx.createSelectorQuery().in(this);
    query.select(".message-list").boundingClientRect();
    query.select(".message-stack").boundingClientRect();
    query.exec(res => {
      const listRect = res && res[0];
      const stackRect = res && res[1];
      if (!listRect || !stackRect) {
        this._scrollBottom(smooth);
        return;
      }
      const targetTop = Math.max(0, Math.ceil(stackRect.height - listRect.height + 2));
      this._scrollSequence = (this._scrollSequence || 0) + 1;
      this.setData({
        scrollIntoView: "",
        scrollTop: targetTop + this._scrollSequence,
        scrollWithAnimation: Boolean(smooth)
      });
    });
  },

  _scrollBottomDuringStreaming() {
    const now = Date.now();
    if (now - (this._lastStreamingScrollAt || 0) < 260) return;
    this._lastStreamingScrollAt = now;
    this._scrollBottom(false);
  },

  _calculateComposerRestBottom(info) {
    const systemInfo = info || {};
    const windowWidth = Number(systemInfo.windowWidth) || 375;
    const rpxToPx = windowWidth / 750;
    const screenHeight = Number(systemInfo.screenHeight) || 0;
    const safeAreaBottom = systemInfo.safeArea && Number(systemInfo.safeArea.bottom)
      ? Number(systemInfo.safeArea.bottom)
      : screenHeight;
    const safeBottom = screenHeight && safeAreaBottom
      ? Math.max(0, screenHeight - safeAreaBottom)
      : 0;

    return Math.ceil((104 + 16) * rpxToPx + safeBottom + 16);
  },

  _calculateMessageListTop(info, safeTop) {
    const windowWidth = Number(info && info.windowWidth) || 375;
    const rpxToPx = windowWidth / 750;
    return Math.ceil((Number(safeTop) || 0) + (104 + 20) * rpxToPx);
  },

  _scrollBottomSoon(smooth = true) {
    wx.nextTick(() => this._scrollBottomByMeasure(smooth));
    setTimeout(() => this._scrollBottomByMeasure(smooth), 100);
  },

  _settleConversationBottom() {
    wx.nextTick(() => this._scrollBottomByMeasure(true));
    setTimeout(() => this._scrollBottomByMeasure(true), 180);
    setTimeout(() => this._scrollBottomByMeasure(true), 420);
    setTimeout(() => this._scrollBottomByMeasure(true), 760);
  },


  _measureComposer(scrollAfterMeasure) {
    setTimeout(() => {
      const query = wx.createSelectorQuery().in(this);
      query.select(".composer-wrap").boundingClientRect(rect => {
        if (!rect || !rect.height) {
          if (scrollAfterMeasure) this._scrollBottomSoon(false);
          return;
        }

        const composerBottom = this.data.keyboardHeight
          ? this.data.keyboardHeight + 8
          : this.data.composerRestBottom;

        // Make the scroll-view viewport end above the floating composer.
        // This is more stable than page padding or a giant bottom spacer.
        const messageListBottom = Math.ceil(rect.height + composerBottom + 6);

        this.setData({
          messageListBottom,
          pageBottomInset: 0,
          messageBottomInset: 16
        }, () => {
          if (scrollAfterMeasure) this._scrollBottomSoon(false);
        });
      }).exec();
    }, 50);
  }
});
