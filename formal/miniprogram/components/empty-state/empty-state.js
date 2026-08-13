Component({
  options: { styleIsolation: "shared" },
  properties: {
    icon:  { type: String, value: "🏋️" },
    title: { type: String, value: "暂无内容" },
    desc:  { type: String, value: "" },
    btnText: { type: String, value: "" },
    btnType: { type: String, value: "primary" },
    showBtn: { type: Boolean, value: false }
  },
  methods: {
    onBtnTap() { this.triggerEvent("action"); }
  }
})
