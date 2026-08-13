const { PendingWriteType } = require("../../shared/types/agent_types.js");

function buildProfilePending(profilePatch) {
  return {
    type: PendingWriteType.USER_PROFILE,
    target: "userProfile",
    data: { profilePatch: profilePatch || {}, source: "chat" },
    summaryForUser: "用户画像更新"
  };
}

module.exports = { buildProfilePending };
