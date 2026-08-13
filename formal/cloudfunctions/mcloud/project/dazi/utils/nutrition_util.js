function toNonNegativeNumber(value) {
	const number = Number(value);
	return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function calculateCaloriesByMacros(carbs, protein, fat) {
	return Math.round(
		toNonNegativeNumber(carbs) * 4 +
		toNonNegativeNumber(protein) * 4 +
		toNonNegativeNumber(fat) * 9
	);
}

function hasMacroData(item) {
	if (!item || typeof item !== 'object') return false;
	return ['carbs', 'protein', 'fat'].some(key => (
		Object.prototype.hasOwnProperty.call(item, key) &&
		item[key] !== '' &&
		item[key] !== null &&
		item[key] !== undefined
	));
}

function calculateFoodCalories(item) {
	if (!item || typeof item !== 'object') return 0;
	if (hasMacroData(item)) {
		return calculateCaloriesByMacros(item.carbs, item.protein, item.fat);
	}
	return Math.round(toNonNegativeNumber(item.calories));
}

module.exports = {
	calculateCaloriesByMacros,
	calculateFoodCalories,
	hasMacroData,
	toNonNegativeNumber
};
