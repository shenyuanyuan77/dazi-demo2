function patchWorkoutProposal(proposal, patch = {}) {
  if (!proposal || proposal.type !== "workoutPlan") return proposal;
  const next = JSON.parse(JSON.stringify(proposal));
  if (patch.focus) next.payload.focus = patch.focus;

  if (patch.setCount) {
    const setCount = Math.max(1, Math.min(10, Number(patch.setCount) || 1));
    next.payload.exercises = (next.payload.exercises || []).map(exercise => {
      const oldSets = Array.isArray(exercise.sets) && exercise.sets.length
        ? exercise.sets
        : [{ weight: "", reps: "10" }];
      const template = oldSets[0] || { weight: "", reps: "10" };
      return Object.assign({}, exercise, {
        sets: Array.from({ length: setCount }).map((_, index) => oldSets[index] || template)
      });
    });
  }

  next.status = "pending";
  return next;
}

function patchProposal(proposal, patch = {}) {
  if (!proposal) return proposal;
  if (proposal.type === "workoutPlan") return patchWorkoutProposal(proposal, patch);
  return Object.assign({}, proposal, {
    payload: Object.assign({}, proposal.payload || {}, patch),
    status: "pending"
  });
}

module.exports = { patchProposal, patchWorkoutProposal };
