const { cloneJson } = require("../shared/utils/object.js");

function createSandboxDb(initialState) {
  initialState = initialState || {};
  return {
    userProfiles: {
      "eval-user": cloneJson(initialState.userProfile || {}, {})
    },
    dietLogs: cloneJson(initialState.dietLogs || [], []),
    trainingLogs: cloneJson(initialState.trainingLogs || [], []),
    trainingPlans: cloneJson(initialState.trainingPlans || [], []),
    bodyMetrics: cloneJson(initialState.bodyMetrics || [], [])
  };
}

function snapshotDb(db) {
  return cloneJson(db || {}, {});
}

module.exports = {
  createSandboxDb,
  snapshotDb
};
