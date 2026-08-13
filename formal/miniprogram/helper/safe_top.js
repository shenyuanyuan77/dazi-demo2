// helper/safe_top.js
// 单一来源：状态栏高度 + 胶囊导航高度，避免每个页面重复 wx.getSystemInfoSync
// 用法：const { safeTop, customBarHeight } = require('../../../helper/safe_top.js');
//
// 自愈能力：当 require 路径不正确时（不同目录深度下漏了一层 ..），返回保守默认值，
// 而不是抛出 module not found 阻塞整个页面渲染。

const FALLBACK = { statusBarHeight: 20, customBarHeight: 44, safeTop: 64, capsule: null };

function getGlobal() {
  try {
    const app = typeof getApp === 'function' ? getApp() : null;
    return (app && app.globalData) || {};
  } catch (err) {
    return {};
  }
}

function compute() {
  const g = getGlobal();
  if (g.statusBarHeight !== undefined && g.customBarHeight !== undefined) {
    return {
      statusBarHeight: g.statusBarHeight,
      customBarHeight: g.customBarHeight,
      safeTop: (g.statusBarHeight || 0) + (g.customBarHeight || 0),
      capsule: g.capsule || null
    };
  }
  return Object.assign({}, FALLBACK);
}

module.exports = {
  getSafeTop() {
    return compute().safeTop;
  },
  getStatusBarHeight() {
    return compute().statusBarHeight;
  },
  getCustomBarHeight() {
    return compute().customBarHeight;
  },
  getCapsule() {
    return compute().capsule;
  },
  getAll() {
    return compute();
  },
  /**
   * 把安全区信息直接写入页面 setData 的局部对象，便于一次渲染
   * @param {object} target 现有 data 对象
   */
  injectInto(target) {
    const info = compute();
    return Object.assign({}, target, {
      statusBarHeight: info.statusBarHeight,
      customBarHeight: info.customBarHeight,
      safeTop: info.safeTop,
      capsuleRight: info.capsule ? info.capsule.right : null
    });
  }
};