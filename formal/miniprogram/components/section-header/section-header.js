Component({
  options: { styleIsolation: "shared" },
  properties: {
    title:    { type: String, value: "" },
    subtitle: { type: String, value: "" },
    action:   { type: String, value: "" },
    showMore: { type: Boolean, value: false }
  },
  methods: {
    onActionTap() { this.triggerEvent("action"); },
    onMoreTap()   { this.triggerEvent("more"); }
  }
})
