const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

const aiService = read("cloudfunctions/mcloud/project/dazi/service/ai_service.js");
assert.match(aiService, /history:\s*resolvedHistory/);
assert.doesNotMatch(aiService, /isolatedHistory/);

const myPage = read("miniprogram/projects/dazi/pages/my/index/my_index.wxml");
assert.doesNotMatch(myPage, /<canvas\b/);
assert.match(myPage, /class="weight-chart-view"/);

const floatingPanel = read("miniprogram/components/floating-input-panel/index.wxml");
assert.match(floatingPanel, /bindkeyboardheightchange="onKeyboardHeightChange"/);
assert.match(floatingPanel, /focus="\{\{inputFocus\}\}"/);

const appConfig = JSON.parse(read("miniprogram/app.json"));
assert.equal(appConfig.darkmode, true);
assert.equal(appConfig.themeLocation, "theme.json");

const chatJs = read("miniprogram/projects/dazi/pages/ai/chat/ai_chat.js");
const chatWxml = read("miniprogram/projects/dazi/pages/ai/chat/ai_chat.wxml");
assert.doesNotMatch(chatJs, /AI_MESSAGE_CONTENT:\s*""/);
assert.match(chatJs, /getMenuButtonBoundingClientRect/);
assert.match(chatWxml, /padding-top:\s*\{\{safeTop\}\}px/);
assert.doesNotMatch(chatWxml, /scroll-into-view/);
assert.match(chatWxml, /scroll-top="\{\{scrollTop\}\}"/);
assert.match(chatWxml, /padding-bottom:\s*\{\{messageBottomInset\}\}px/);
assert.match(chatJs, /boundingClientRect/);

const tabbarWxml = read("miniprogram/custom-tab-bar/index.wxml");
assert.match(tabbarWxml, /class="tab-icon-image"/);
assert.doesNotMatch(tabbarWxml, /home-roof|diet-plate|training-plate|profile-head/);
[
  "home.png",
  "home-active.png",
  "diet.png",
  "diet-active.png",
  "training.png",
  "training-active.png",
  "profile.png",
  "profile-active.png",
  "new-message.png",
  "history.png"
].forEach(file => {
  assert.ok(fs.existsSync(path.join(root, "miniprogram/images/ui-icons", file)));
});

[
  "miniprogram/projects/dazi/pages/home/index/home_index.wxml",
  "miniprogram/projects/dazi/pages/diet/index/diet_index.wxml",
  "miniprogram/projects/dazi/pages/training/index/training_index.wxml",
  "miniprogram/projects/dazi/pages/my/index/my_index.wxml"
].forEach(file => {
  assert.match(read(file), /padding-top:\s*\{\{safeTop\}\}px/);
});

console.log("Prompt 20 regression tests passed");
