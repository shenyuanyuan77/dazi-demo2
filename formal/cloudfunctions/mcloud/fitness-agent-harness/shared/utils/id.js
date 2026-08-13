function createId(prefix) {
  return `${prefix || "id"}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

module.exports = { createId };
