// components/clarify-form/index.js
// 用于 AI 输入补全（input_required 事件）的内嵌表单
// props.clarify = { requestId, title, summary, missingFields, allowedActions }
// events: submit(e), skip(e), cancel(e)
Component({
  properties: {
    clarify: {
      type: Object,
      value: {}
    }
  },
  data: {
    formData: {},
    canSkip: true,
    canCancel: true
  },
  observers: {
    'clarify': function (clarify) {
      const fields = (clarify && clarify.missingFields) || [];
      const formData = {};
      fields.forEach(field => {
        if (field && field.suggested !== undefined) {
          formData[field.key] = String(field.suggested);
        } else {
          formData[field.key] = "";
        }
      });
      const allowed = (clarify && clarify.allowedActions) || ["submit", "skip", "cancel"];
      this.setData({
        formData,
        canSkip: allowed.indexOf("skip") >= 0,
        canCancel: allowed.indexOf("cancel") >= 0
      });
    }
  },
  methods: {
    onInput(e) {
      const key = e.currentTarget.dataset.key;
      this.setData({ [`formData.${key}`]: e.detail.value });
    },
    onSelect(e) {
      const { key, value } = e.currentTarget.dataset;
      this.setData({ [`formData.${key}`]: value });
    },
    onSubmit() {
      const formData = this.data.formData;
      const missing = (this.data.clarify.missingFields || []).filter(field => {
        if (!field.required) return false;
        const v = formData[field.key];
        return v === undefined || v === null || String(v).trim() === "";
      });
      if (missing.length) {
        wx.showToast({ title: `请填写 ${missing[0].label}`, icon: "none" });
        return;
      }
      this.triggerEvent("submit", { requestId: this.data.clarify.requestId, formData });
    },
    onSkip() {
      this.triggerEvent("skip", { requestId: this.data.clarify.requestId });
    },
    onCancel() {
      this.triggerEvent("cancel", { requestId: this.data.clarify.requestId });
    }
  }
});