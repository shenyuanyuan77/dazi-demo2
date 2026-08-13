const assert = require("assert");

const app = { globalData: { pendingTabIndex: 0 } };
global.getApp = () => app;
global.getCurrentPages = () => [{ route: "projects/dazi/pages/home/index/home_index" }];

let definition = null;
global.Component = value => {
  definition = value;
};

require("../custom-tab-bar/index.js");
assert.ok(definition);
assert.deepStrictEqual(
  definition.data.list.map(item => item.label),
  ["首页", "饮食", "AI 教练", "训练", "我的"]
);

const visited = [];
global.wx = {
  switchTab({ url }) {
    visited.push(url);
  },
  vibrateShort() {}
};

const component = {
  data: JSON.parse(JSON.stringify(definition.data)),
  setData(patch, callback) {
    this.data = Object.assign({}, this.data, patch);
    if (callback) callback();
  }
};
Object.assign(component, definition.methods);
component._lastTapAt = 0;

definition.data.list.slice(1).forEach(item => {
  component.onTabTap({
    currentTarget: { dataset: { index: item.index, path: item.path } }
  });
  component._lastTapAt = 0;
});

assert.deepStrictEqual(visited, [
  "/projects/dazi/pages/diet/index/diet_index",
  "/projects/dazi/pages/ai/chat/ai_chat",
  "/projects/dazi/pages/training/index/training_index",
  "/projects/dazi/pages/my/index/my_index"
]);

console.log("tabbar navigation tests passed");
