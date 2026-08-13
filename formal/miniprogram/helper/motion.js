// helper/motion.js
// iOS 26 / HIG 缓动 + 时长常量 + 工具函数
// 配合 ios-base 中的样式 class 使用

const EASING = {
  // iOS 标准 ease-in-out
  standard: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
  // iOS 弹簧（带轻微回弹）
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  // iOS decelerate（弹出/入场）
  decelerate: 'cubic-bezier(0.22, 1, 0.36, 1)',
  // iOS accelerate（收回/退出）
  accelerate: 'cubic-bezier(0.64, 0, 0.78, 0)',
  // iOS 线性
  linear: 'linear'
};

const DURATION = {
  fastest: 150,    // 微交互
  fast: 200,       // 按下反馈
  normal: 300,     // 默认过渡
  slow: 450,       // 弹层入场
  slower: 600      // 大型转场
};

function fadeIn(duration = DURATION.normal) {
  return {
    from: { opacity: 0 },
    to: { opacity: 1 },
    duration,
    easing: EASING.decelerate
  };
}

function fadeOut(duration = DURATION.fast) {
  return {
    from: { opacity: 1 },
    to: { opacity: 0 },
    duration,
    easing: EASING.accelerate
  };
}

function slideUp(distance = 24, duration = DURATION.slow) {
  return {
    from: { opacity: 0, transform: `translateY(${distance}px)` },
    to: { opacity: 1, transform: 'translateY(0)' },
    duration,
    easing: EASING.spring
  };
}

function scaleIn(scale = 0.96, duration = DURATION.normal) {
  return {
    from: { opacity: 0, transform: `scale(${scale})` },
    to: { opacity: 1, transform: 'scale(1)' },
    duration,
    easing: EASING.spring
  };
}

// 轻量级 wx.createAnimation 包装
function wxAnim(type = 'in', opts = {}) {
  if (typeof wx === 'undefined' || !wx.createAnimation) return null;
  const anim = wx.createAnimation({
    duration: opts.duration || (type === 'in' ? DURATION.slow : DURATION.fast),
    timingFunction: opts.easing || (type === 'in' ? EASING.spring : EASING.accelerate),
    delay: opts.delay || 0,
    transformOrigin: opts.transformOrigin || '50% 50%'
  });
  if (type === 'in') {
    if (opts.slide) {
      anim.translateY(opts.slideDistance || 24).opacity(0).step({ duration: 1 });
      anim.translateY(0).opacity(1).step();
    } else if (opts.scale) {
      anim.scale(opts.scaleFrom || 0.96).opacity(0).step({ duration: 1 });
      anim.scale(1).opacity(1).step();
    } else {
      anim.opacity(0).step({ duration: 1 });
      anim.opacity(1).step();
    }
  } else {
    if (opts.slide) {
      anim.translateY(opts.slideDistance || 24).opacity(0).step();
    } else {
      anim.opacity(0).step();
    }
  }
  return anim.export();
}

module.exports = {
  EASING,
  DURATION,
  fadeIn,
  fadeOut,
  slideUp,
  scaleIn,
  wxAnim
};