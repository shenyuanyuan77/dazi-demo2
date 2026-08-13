const AUTH_KEY = "fitness_wechat_user";
const MIGRATION_OWNER_KEY = "fitness_storage_migration_owner";

function getUser() {
  return wx.getStorageSync(AUTH_KEY) || null;
}

function getUserId() {
  const user = getUser();
  return user && user.userId ? String(user.userId) : "";
}

function key(baseKey) {
  const userId = getUserId();
  return userId ? `${baseKey}:${userId}` : `${baseKey}:guest`;
}

function get(baseKey, fallback) {
  const scopedKey = key(baseKey);
  const scoped = wx.getStorageSync(scopedKey);
  if (scoped !== "" && scoped !== undefined) return scoped;

  // One-time migration keeps existing data for the first signed-in user.
  const legacy = wx.getStorageSync(baseKey);
  const migrationOwner = wx.getStorageSync(MIGRATION_OWNER_KEY);
  if (
    legacy !== "" &&
    legacy !== undefined &&
    (!migrationOwner || migrationOwner === getUserId())
  ) {
    if (!migrationOwner) wx.setStorageSync(MIGRATION_OWNER_KEY, getUserId());
    set(baseKey, legacy);
    return legacy;
  }
  return fallback;
}

function set(baseKey, value) {
  wx.setStorageSync(key(baseKey), value);
  if (getUserId()) {
    const cloudHelper = require("../../../helper/cloud_helper.js");
    cloudHelper.callCloud("user_state/save", {
      type: baseKey,
      data: value || {}
    }, { hint: false }).catch(() => {});
  }
}

function remove(baseKey) {
  wx.removeStorageSync(key(baseKey));
  set(baseKey, {});
}

async function hydrate() {
  if (!getUserId()) return;
  const cloudHelper = require("../../../helper/cloud_helper.js");
  const state = await cloudHelper.callCloudData("user_state/get_all", {}, { hint: false });
  Object.keys(state || {}).forEach(baseKey => {
    wx.setStorageSync(key(baseKey), state[baseKey] || {});
  });
}

module.exports = {
  AUTH_KEY,
  getUser,
  getUserId,
  key,
  get,
  set,
  remove,
  hydrate
};
