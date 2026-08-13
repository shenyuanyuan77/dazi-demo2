const assert = require("assert");
const proposalPatch = require("../projects/dazi/biz/proposal_patch.js");

function buildWorkoutProposal() {
  return {
    id: "pending-workout",
    type: "workoutPlan",
    status: "pending",
    payload: {
      date: "2026-06-15",
      planName: "居家训练计划",
      exercises: [
        {
          name: "深蹲",
          sets: [
            { setIndex: 1, reps: "10", restSeconds: 60 },
            { setIndex: 2, reps: "10", restSeconds: 60 },
            { setIndex: 3, reps: "10", restSeconds: 60 }
          ]
        },
        {
          name: "波比跳",
          sets: [
            { setIndex: 1, reps: "8", restSeconds: 60 },
            { setIndex: 2, reps: "8", restSeconds: 60 },
            { setIndex: 3, reps: "8", restSeconds: 60 }
          ]
        }
      ]
    }
  };
}

const everySetPatch = proposalPatch.applyPendingProposalPatch(
  buildWorkoutProposal(),
  "每个项目 6 组",
  { tomorrowKey: "2026-06-16", userProfile: { goal: "body_shaping" } }
);
assert.strictEqual(everySetPatch.applied, true);
assert.ok(everySetPatch.proposal.payload.exercises.every(item => item.sets.length === 6));

const removePatch = proposalPatch.applyPendingProposalPatch(
  buildWorkoutProposal(),
  "不要波比跳",
  { tomorrowKey: "2026-06-16", userProfile: { goal: "body_shaping" } }
);
assert.strictEqual(removePatch.applied, true);
assert.ok(removePatch.proposal.payload.exercises.every(item => item.name !== "波比跳"));

const tomorrowPatch = proposalPatch.applyPendingProposalPatch(
  buildWorkoutProposal(),
  "保存到明天",
  { tomorrowKey: "2026-06-16", userProfile: { goal: "body_shaping" } }
);
assert.strictEqual(tomorrowPatch.applied, true);
assert.strictEqual(tomorrowPatch.proposal.payload.date, "2026-06-16");

const focusPatch = proposalPatch.applyPendingProposalPatch(
  buildWorkoutProposal(),
  "改成练腿",
  { tomorrowKey: "2026-06-16", userProfile: { goal: "muscle_gain" } }
);
assert.strictEqual(focusPatch.applied, true);
assert.ok(Array.isArray(focusPatch.proposal.payload.exercises));
assert.ok(focusPatch.proposal.payload.exercises.length > 0);

console.log("Proposal patch tests passed");
