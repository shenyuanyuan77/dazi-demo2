const assert = require("assert");

const storage = {};
global.wx = {
  getStorageSync(key) {
    return storage[key] || "";
  },
  setStorageSync(key, value) {
    storage[key] = value;
  },
  removeStorageSync(key) {
    delete storage[key];
  },
  showToast() {},
  showModal() {},
  showActionSheet() {}
};

let pageDefinition;
global.Page = definition => {
  pageDefinition = definition;
};

require("../projects/dazi/pages/training/index/training_index.js");

const page = Object.assign({}, pageDefinition, {
  data: Object.assign({}, pageDefinition.data, {
    selectedDate: "2026-06-14",
    exercises: [{
      id: "ai-draft-1-0",
      name: "杯式深蹲",
      expanded: false,
      sets: [{
        id: "ai-draft-1-set-1",
        weight: "20",
        reps: "10",
        completed: false,
        done: false
      }]
    }],
    restTimer: Object.assign({}, pageDefinition.data.restTimer)
  }),
  setData(patch) {
    Object.keys(patch).forEach(key => {
      this.data[key] = patch[key];
    });
  },
  _savePlan() {},
  _refreshWorkoutSummary() {},
  _markWorkoutStarted() {},
  _startRestTimer(exerciseId, setId) {
    this.startedTimerFor = [exerciseId, setId];
  }
});

page.toggleExercise({
  currentTarget: { dataset: { id: "ai-draft-1-0" } }
});
assert.strictEqual(page.data.exercises[0].expanded, true);

page.updateSet({
  currentTarget: {
    dataset: {
      exercise: "ai-draft-1-0",
      set: "ai-draft-1-set-1",
      field: "weight"
    }
  },
  detail: { value: "22.5" }
});
assert.strictEqual(page.data.exercises[0].sets[0].weight, "22.5");

page.toggleSet({
  currentTarget: {
    dataset: {
      exercise: "ai-draft-1-0",
      set: "ai-draft-1-set-1"
    }
  }
});
assert.strictEqual(page.data.exercises[0].sets[0].completed, true);
assert.deepStrictEqual(page.startedTimerFor, [
  "ai-draft-1-0",
  "ai-draft-1-set-1"
]);

console.log("AI-written training plan interaction tests passed");
