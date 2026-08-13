function readEnv(name, fallback = '') {
	const value = String(process.env[name] || fallback).trim();
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1).trim();
	}
	return value;
}

function normalizeMiMoEndpoint() {
	const endpoint = readEnv(
		'MIMO_BASE_URL',
		'https://api.xiaomimimo.com/v1/chat/completions'
	).replace(/\/+$/, '');
	return /\/v1$/i.test(endpoint) ? `${endpoint}/chat/completions` : endpoint;
}

module.exports = {
	// CloudBase environment.
	CLOUD_ID: 'health-d2gzr4rf8d6446327',
	COLLECTION_PRFIX: 'bx_',

	// Fitness Coach / Xiaomi MiMo.
	// API keys must only be configured through cloud function environment variables.
	MIMO_API_KEY: readEnv('MIMO_API_KEY'),
	MIMO_BASE_URL: normalizeMiMoEndpoint(),
	// Keep routing deterministic: vision uses v2.5, every text-only request uses Flash.
	MIMO_MODEL: 'mimo-v2.5',
	MIMO_FAST_MODEL: 'mimo-v2-flash',
	MIMO_TIMEOUT: Number(readEnv('MIMO_TIMEOUT', '60000')) || 60000,

	IS_DEMO: false,
	TEST_MODE: false,
	TEST_TOKEN_ID: 'oD58U5Ej-gK0BjqSspqjQEPgXuQQ',

	CLIENT_CHECK_CONTENT: false,
	ADMIN_CHECK_CONTENT: false,

	ADMIN_LOGIN_EXPIRE: 86400,
	WORK_LOGIN_EXPIRE: 86400,
};
