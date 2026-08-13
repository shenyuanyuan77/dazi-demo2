function plainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sanitizeObject(value, options) {
  const maxKeys = Number(options && options.maxKeys) || 80;
  const maxString = Number(options && options.maxString) || 1200;
  if (!plainObject(value)) return {};
  const out = {};
  for (const key of Object.keys(value).slice(0, maxKeys)) {
    if (key === "__proto__" || key === "prototype" || key === "constructor") continue;
    const safeKey = String(key).slice(0, 80);
    const item = value[key];
    if (item === undefined) continue;
    if (item === null || typeof item === "number" || typeof item === "boolean") {
      out[safeKey] = item;
    } else if (typeof item === "string") {
      out[safeKey] = item.slice(0, maxString);
    } else if (Array.isArray(item)) {
      out[safeKey] = item.slice(0, 80).map(child => (
        plainObject(child) ? sanitizeObject(child, options) : child
      ));
    } else if (plainObject(item)) {
      out[safeKey] = sanitizeObject(item, options);
    }
  }
  return out;
}

function cloneJson(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value === undefined ? fallback : value));
  } catch (err) {
    return fallback;
  }
}

module.exports = {
  cloneJson,
  plainObject,
  sanitizeObject
};
