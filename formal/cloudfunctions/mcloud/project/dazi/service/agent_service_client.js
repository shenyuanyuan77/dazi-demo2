// cloudfunctions/mcloud/project/dazi/service/agent_service_client.js
// Python agent-service (LangGraph) HTTP 转发 client.
//
// 用途: 当 AGENT_USE_PYTHON=true 时, ai_service 把请求转发到这里,
//       由 Python agent-service 处理意图/检索/生成/门禁, 云函数只做鉴权+图片转HTTPS+落库.
//
// 失败降级: Python 不可用 -> 抛错, 由 ai_service 捕获后回退 Node harness (见 sendMessage).
const https = require("https");
const http = require("http");
const { URL } = require("url");
const config = require("../../../config/config.js");

/**
 * 转发一个对话回合到 Python agent-service.
 * @param {Object} input - 与 /agent/turn 入参对齐 (camelCase).
 * @returns {Promise<Object>} - { ok, answer, trace, error }
 */
async function forwardTurn(input) {
	const baseUrl = readEnv("AGENT_SERVICE_URL", "http://127.0.0.1:8787");
	const token = readEnv("AGENT_INTERNAL_TOKEN", "");
	const url = new URL(baseUrl + "/agent/turn");
	const body = JSON.stringify(input);
	const lib = url.protocol === "https:" ? https : http;

	return new Promise((resolve) => {
		const req = lib.request(
			{
				hostname: url.hostname,
				port: url.port || (url.protocol === "https:" ? 443 : 80),
				path: url.pathname,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Content-Length": Buffer.byteLength(body),
					...(token ? { "X-Internal-Token": token } : {}),
				},
				timeout: Number(readEnv("AGENT_SERVICE_TIMEOUT", "30000")) || 30000,
			},
			(res) => {
				let data = "";
				res.on("data", (chunk) => (data += chunk));
				res.on("end", () => {
					try {
						const parsed = JSON.parse(data);
						resolve(parsed);
					} catch (err) {
						resolve({ ok: false, error: "agent_service_bad_json" });
					}
				});
			}
		);
		req.on("error", (err) => {
			resolve({ ok: false, error: "agent_service_unreachable:" + String(err.message).slice(0, 80) });
		});
		req.on("timeout", () => {
			req.destroy();
			resolve({ ok: false, error: "agent_service_timeout" });
		});
		req.write(body);
		req.end();
	});
}

/**
 * 健康检查 agent-service.
 */
async function healthCheck() {
	const baseUrl = readEnv("AGENT_SERVICE_URL", "http://127.0.0.1:8787");
	const url = new URL(baseUrl + "/health");
	const lib = url.protocol === "https:" ? https : http;
	return new Promise((resolve) => {
		const req = lib.request(
			{
				hostname: url.hostname,
				port: url.port || (url.protocol === "https:" ? 443 : 80),
				path: url.pathname,
				method: "GET",
				timeout: 5000,
			},
			(res) => {
				let data = "";
				res.on("data", (chunk) => (data += chunk));
				res.on("end", () => {
					try {
						resolve(JSON.parse(data));
					} catch {
						resolve({ ok: false });
					}
				});
			}
		);
		req.on("error", () => resolve({ ok: false }));
		req.on("timeout", () => {
			req.destroy();
			resolve({ ok: false });
		});
		req.end();
	});
}

/**
 * 灰度路由: 决定本次请求走 Python agent 还是 Node harness.
 * 策略: AGENT_USE_PYTHON=on -> 全量; =gray -> 按 userId 哈希百分比; 否则 Node.
 */
function shouldUsePythonAgent(userId) {
	const flag = String(readEnv("AGENT_USE_PYTHON", "off")).toLowerCase();
	if (flag === "on" || flag === "true" || flag === "1") return true;
	if (flag === "off" || flag === "false" || flag === "0") return false;
	// gray: 按 userId 哈希取模, 百分比由 AGENT_GRAY_PERCENT 控制
	if (flag === "gray") {
		const percent = Math.max(0, Math.min(100, Number(readEnv("AGENT_GRAY_PERCENT", "0")) || 0));
		if (percent <= 0) return false;
		if (percent >= 100) return true;
		const hash = simpleHash(String(userId || ""));
		return (hash % 100) < percent;
	}
	return false;
}

function simpleHash(str) {
	let h = 0;
	for (let i = 0; i < str.length; i++) {
		h = ((h << 5) - h + str.charCodeAt(i)) | 0;
	}
	return Math.abs(h);
}

function readEnv(name, fallback = "") {
	const v = String(process.env[name] || fallback).trim();
	if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
		return v.slice(1, -1).trim();
	}
	return v;
}

module.exports = {
	forwardTurn,
	healthCheck,
	shouldUsePythonAgent,
};
