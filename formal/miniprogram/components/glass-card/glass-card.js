Component({
  options: { styleIsolation: "shared" },
  properties: {
    elevated: { type: Boolean, value: false },
    padding: { type: Boolean, value: true },
    radius: { type: String, value: "2xl" }
  },
  methods: {
    onTap(e) { this.triggerEvent("tap", e.detail); }
  }
})
