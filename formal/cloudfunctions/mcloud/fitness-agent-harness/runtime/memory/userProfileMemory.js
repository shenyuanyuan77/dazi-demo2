const { sanitizeObject } = require("../../shared/utils/object.js");

function normalizeUserProfile(profile) {
  const clean = sanitizeObject(profile || {});
  if (clean.weightKg !== undefined) clean.weightKg = Math.round(Number(clean.weightKg) * 10) / 10;
  if (clean.heightCm !== undefined) clean.heightCm = Math.round(Number(clean.heightCm));
  return clean;
}

module.exports = { normalizeUserProfile };
