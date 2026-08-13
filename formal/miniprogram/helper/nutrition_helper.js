function toNonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function round(value, precision) {
  const factor = Math.pow(10, precision || 0);
  return Math.round(value * factor) / factor;
}

function calculateCaloriesByMacros(carbs, protein, fat) {
  return Math.round(
    toNonNegativeNumber(carbs) * 4 +
    toNonNegativeNumber(protein) * 4 +
    toNonNegativeNumber(fat) * 9
  );
}

function hasMacroData(item) {
  if (!item || typeof item !== "object") return false;
  return ["carbs", "protein", "fat"].some(key => (
    Object.prototype.hasOwnProperty.call(item, key) &&
    item[key] !== "" &&
    item[key] !== null &&
    item[key] !== undefined
  ));
}

function calculateFoodCalories(item) {
  if (!item || typeof item !== "object") return 0;
  if (hasMacroData(item)) {
    return calculateCaloriesByMacros(item.carbs, item.protein, item.fat);
  }
  return Math.round(toNonNegativeNumber(item.calories));
}

function normalizeNutritionItem(item) {
  const source = item && typeof item === "object" ? item : {};
  const normalized = Object.assign({}, source);
  if (hasMacroData(source)) {
    normalized.carbs = round(toNonNegativeNumber(source.carbs), 1);
    normalized.protein = round(toNonNegativeNumber(source.protein), 1);
    normalized.fat = round(toNonNegativeNumber(source.fat), 1);
  }
  normalized.calories = calculateFoodCalories(source);
  return normalized;
}

function summarizeNutrition(items) {
  const summary = (Array.isArray(items) ? items : []).reduce((total, item) => {
    const normalized = normalizeNutritionItem(item);
    total.calories += normalized.calories;
    total.carbs += toNonNegativeNumber(normalized.carbs);
    total.protein += toNonNegativeNumber(normalized.protein);
    total.fat += toNonNegativeNumber(normalized.fat);
    return total;
  }, { calories: 0, carbs: 0, protein: 0, fat: 0 });

  return {
    calories: Math.round(summary.calories),
    carbs: round(summary.carbs, 1),
    protein: round(summary.protein, 1),
    fat: round(summary.fat, 1)
  };
}

module.exports = {
  calculateCaloriesByMacros,
  calculateFoodCalories,
  hasMacroData,
  normalizeNutritionItem,
  summarizeNutrition,
  toNonNegativeNumber
};
