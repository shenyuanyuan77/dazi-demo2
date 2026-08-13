Component({
  properties: {
    visible: { type: Boolean, value: false },
    title: { type: String, value: "" },
    value: { type: null, value: "" },
    unit: { type: String, value: "" },
    placeholder: { type: String, value: "" },
    inputType: { type: String, value: "number" },
    min: { type: Number, value: 0 },
    max: { type: Number, value: 99999 },
    options: { type: Array, value: [] }
  },

  data: {
    localValue: "",
    keyboardHeight: 0,
    inputFocus: false
  },

  observers: {
    "visible,value": function visibleValueChanged(visible, value) {
      if (visible) {
        this.setData({
          localValue: String(value === undefined ? "" : value),
          inputFocus: false
        }, () => {
          setTimeout(() => this.setData({ inputFocus: true }), 80);
        });
      } else {
        this.setData({ keyboardHeight: 0, inputFocus: false });
      }
    }
  },

  lifetimes: {
    attached() {
      this._keyboardHandler = ({ height }) => {
        this.setData({ keyboardHeight: Math.max(0, Number(height) || 0) });
      };
      wx.onKeyboardHeightChange(this._keyboardHandler);
    },
    detached() {
      if (this._keyboardHandler) wx.offKeyboardHeightChange(this._keyboardHandler);
    }
  },

  methods: {
    onInput(e) {
      this.setData({ localValue: e.detail.value });
    },

    onKeyboardHeightChange(e) {
      const detail = e && e.detail ? e.detail : e;
      this.setData({ keyboardHeight: Math.max(0, Number(detail && detail.height) || 0) });
    },

    onFocus(e) {
      this.onKeyboardHeightChange(e);
    },

    onBlur() {
      this.setData({ keyboardHeight: 0 });
    },

    onSelect(e) {
      this.setData({ localValue: this.properties.options[Number(e.detail.value)] || "" });
    },

    onDate(e) {
      this.setData({ localValue: e.detail.value });
    },

    cancel() {
      wx.hideKeyboard();
      this.setData({ keyboardHeight: 0, inputFocus: false });
      this.triggerEvent("cancel");
    },

    confirm() {
      const value = String(this.data.localValue || "").trim();
      if (!value) {
        wx.showToast({ title: this.properties.placeholder || "请输入内容", icon: "none" });
        return;
      }
      if (this.properties.inputType === "number") {
        const number = Number(value);
        if (!Number.isFinite(number) || number < this.properties.min || number > this.properties.max) {
          wx.showToast({
            title: `请输入 ${this.properties.min}-${this.properties.max} 之间的数值`,
            icon: "none"
          });
          return;
        }
      }
      wx.hideKeyboard();
      this.setData({ keyboardHeight: 0, inputFocus: false });
      this.triggerEvent("confirm", { value });
    },

    stop() {}
  }
});
