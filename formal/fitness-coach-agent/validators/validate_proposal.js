const { validateDietLogPayload } = require("./validate_diet_log.js");
const { validateWorkoutPlanPayload } = require("./validate_workout_plan.js");
const { validateProfilePatchPayload } = require("./validate_profile_patch.js");

function validateProposal(proposal) {
  const errors = [];
  if (!proposal || typeof proposal !== "object") return ["proposal 不能为空"];
  if (!proposal.id) errors.push("proposal.id 不能为空");
  if (!["dietLog", "workoutPlan", "profilePatch"].includes(proposal.type)) {
    errors.push("proposal.type 必须是 dietLog/workoutPlan/profilePatch");
  }
  if (!["pending", "confirmed", "cancelled", "writing", "success", "failed"].includes(proposal.status)) {
    errors.push("proposal.status 非法");
  }

  if (proposal.type === "dietLog") errors.push(...validateDietLogPayload(proposal.payload));
  if (proposal.type === "workoutPlan") errors.push(...validateWorkoutPlanPayload(proposal.payload));
  if (proposal.type === "profilePatch") errors.push(...validateProfilePatchPayload(proposal.payload));

  return errors;
}

function validateAssistantOutput(output) {
  const errors = [];
  if (!output || typeof output !== "object") return ["assistant output 不能为空"];
  const proposals = output.payload && Array.isArray(output.payload.proposals)
    ? output.payload.proposals
    : [];
  proposals.forEach((proposal, index) => {
    const proposalErrors = validateProposal(proposal);
    proposalErrors.forEach(error => errors.push(`proposals[${index}]: ${error}`));
  });
  return errors;
}

module.exports = {
  validateProposal,
  validateAssistantOutput
};
