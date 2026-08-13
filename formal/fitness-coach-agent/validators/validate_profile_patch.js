function validateProfilePatchPayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object") return ["身体数据 payload 不能为空"];
  const patch = payload.profilePatch || {};
  if (!Object.keys(patch).length) errors.push("profilePatch 至少需要一个字段");

  const numericFields = ["currentWeight", "targetWeight", "bodyFat", "height"];
  numericFields.forEach(key => {
    if (patch[key] === undefined || patch[key] === "") return;
    const value = Number(patch[key]);
    if (!Number.isFinite(value) || value <= 0) errors.push(`${key} 必须是正数`);
  });

  return errors;
}

module.exports = { validateProfilePatchPayload };
