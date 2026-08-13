const https = require("https");
const { URL } = require("url");
const config = require("../../../config/config.js");
const AgentRuntime = require("../agent/fitness_agent_runtime.js");
const AiResponseFallback = require("./ai_response_fallback.js");
const nutritionUtil = require("../utils/nutrition_util.js");

class AiAgentAdapter {
  async chat(input) {
    if (!config.MIMO_API_KEY) {
      throw this._providerError("MIMO_API_KEY is not configured", "MIMO_NOT_CONFIGURED");
    }

    return await this._requestMiMo(input);
  }

  async probe() {
    if (!config.MIMO_API_KEY) {
      throw this._providerError("MIMO_API_KEY is not configured", "MIMO_NOT_CONFIGURED");
    }
    const data = await this._postJson(config.MIMO_BASE_URL, {
      model: config.MIMO_MODEL,
      messages: [{ role: "user", content: "只回复 OK" }],
      stream: false,
      max_completion_tokens: 16,
      temperature: 0
    });
    const choice = data && data.choices && data.choices[0];
    return {
      ok: Boolean(choice && choice.message),
      model: String(data && data.model || config.MIMO_MODEL),
      requestId: String(data && data.id || "")
    };
  }

  async estimateCalories(food) {
    if (!config.MIMO_API_KEY) {
      throw this._providerError("MIMO_API_KEY is not configured", "MIMO_NOT_CONFIGURED");
    }
    const data = await this._postJson(config.MIMO_BASE_URL, {
      model: config.MIMO_FAST_MODEL,
      messages: [
        {
          role: "system",
          content: "你是极速食物热量估算器。只返回紧凑 JSON：{\"name\":\"食物名\",\"amount\":\"估算份量\",\"calories\":整数,\"protein\":数字,\"carbs\":数字,\"fat\":数字}。根据用户给出的总分量估算整份数据，不要解释。热量必须满足：碳水克数*4 + 蛋白质克数*4 + 脂肪克数*9。"
        },
        { role: "user", content: String(food || "").slice(0, 120) }
      ],
      stream: false,
      temperature: 0,
      max_completion_tokens: 120
    });
    const choice = data && data.choices && data.choices[0];
    const raw = choice && choice.message ? choice.message.content : "";
    const parsed = this._parseJson(String(raw || "").replace(/^```(?:json)?\s*|\s*```$/gi, ""));
    return {
      name: String(parsed.name || food || "").slice(0, 60),
      amount: String(parsed.amount || "").slice(0, 40),
      calories: nutritionUtil.calculateFoodCalories(parsed),
      protein: Math.max(0, Number(parsed.protein) || 0),
      carbs: Math.max(0, Number(parsed.carbs) || 0),
      fat: Math.max(0, Number(parsed.fat) || 0),
      model: String(data && data.model || config.MIMO_FAST_MODEL)
    };
  }

  async _requestMiMo(input) {
    const model = AgentRuntime.selectModel(input, config);
    const runtime = AgentRuntime.buildConversationMessages(input);

    // [方案A] 激活 RAG 注入 + 官方硬约束 (此前是 dead code)
    let ragSources = [];
    let ragAugmented = false;
    let messages = runtime.messages;
    try {
      const injected = await AgentRuntime.injectOfficialContext(messages, {
        query: input.message,
        useRag: true,
        topK: 5
      });
      messages = injected.messages;
      ragSources = injected.ragSources || [];
      ragAugmented = injected.ragAugmented;
    } catch (_e) {
      // RAG 注入失败 -> 用原始 messages (不阻断)
    }

    const data = await this._postJson(config.MIMO_BASE_URL, {
      model,
      messages,
      stream: false,
      temperature: 0.2,
      max_completion_tokens: AgentRuntime.hasImages(input)
        ? 800
        : (runtime.detailedPlan ? 1100 : 620)
    });

    const choice = data && data.choices && data.choices[0];
    const raw = choice && choice.message ? choice.message.content : "";
    const parsed = this._parseJson(raw);
    const answer = this._normalize(parsed, {
      requestId: String(data && data.id || ""),
      model: String(data && data.model || model)
    }, input);

    // [方案A] 激活来源标注: RAG 检索到来源但模型没标注时追加
    if (ragAugmented && ragSources.length && answer.content) {
      answer.content = AgentRuntime.addSourceCitation(answer.content, ragSources);
    }
    // 在 payload 里记录 RAG 状态 (可观测)
    if (answer.payload && typeof answer.payload === "object") {
      answer.payload.ragAugmented = ragAugmented;
      answer.payload.ragSources = ragSources;
    }
    return answer;
  }

  _postJson(endpoint, payload) {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint);
      const body = JSON.stringify(payload);
      const req = https.request({
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "api-key": config.MIMO_API_KEY
        },
        timeout: config.MIMO_TIMEOUT
      }, res => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", chunk => raw += chunk);
        res.on("end", () => {
          let data = null;
          try {
            data = JSON.parse(raw);
          } catch (err) {
            return reject(this._providerError(
              `MiMo returned invalid JSON (HTTP ${res.statusCode})`,
              "MIMO_INVALID_RESPONSE",
              res.statusCode
            ));
          }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            const message = data && data.error && data.error.message
              ? data.error.message
              : `MiMo HTTP ${res.statusCode}`;
            return reject(this._providerError(
              message,
              this._statusCodeToErrorCode(res.statusCode),
              res.statusCode
            ));
          }
          resolve(data);
        });
      });
      req.on("timeout", () => req.destroy(
        this._providerError("MiMo request timeout", "MIMO_TIMEOUT")
      ));
      req.on("error", err => {
        if (err && err.providerCode) return reject(err);
        reject(this._providerError(
          err && err.message ? err.message : "MiMo network error",
          "MIMO_NETWORK_ERROR"
        ));
      });
      req.write(body);
      req.end();
    });
  }

  _statusCodeToErrorCode(statusCode) {
    if (statusCode === 401 || statusCode === 403) return "MIMO_AUTH_FAILED";
    if (statusCode === 404) return "MIMO_ENDPOINT_OR_MODEL_INVALID";
    if (statusCode === 429) return "MIMO_RATE_LIMITED";
    if (statusCode >= 500) return "MIMO_UPSTREAM_ERROR";
    return "MIMO_REQUEST_REJECTED";
  }

  _providerError(message, providerCode, statusCode = 0) {
    const error = new Error(String(message || "MiMo request failed").slice(0, 300));
    error.providerCode = providerCode;
    error.statusCode = statusCode;
    return error;
  }

  _parseJson(raw) {
    if (typeof raw === "object" && raw) return raw;
    let text = String(raw || "").trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/, "");
    for (let depth = 0; depth < 2; depth += 1) {
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed === "string") {
          text = parsed.trim();
          continue;
        }
        return parsed;
      } catch (ignore) {
        break;
      }
    }
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(text.slice(firstBrace, lastBrace + 1));
      } catch (ignore) {}
    }
    const recovered = this._recoverJsonFields(text);
    if (recovered.content) return recovered;
    if (text) return this._plainAnswer(text);
    throw new Error("MiMo returned an empty response");
  }

  _normalize(answer, upstream = {}, input = {}) {
    if (!answer || typeof answer !== "object" || Array.isArray(answer)) {
      answer = this._plainAnswer(String(answer || ""));
    }
    answer = AiResponseFallback.ensureStructuredAnswer(answer, input);
    const allowedTypes = ["diet", "training", "general"];
    const type = allowedTypes.includes(answer.type) ? answer.type : "general";
    const content = this._cleanDisplayContent(answer.content).slice(0, 3000);
    if (!content) throw new Error("MiMo returned an empty Fitness Coach answer");
    return {
      type,
      title: String(answer.title || "Fitness Coach 建议").slice(0, 60),
      content,
      payload: this._normalizePayload(answer.payload),
      memory: this._normalizeMemory(answer.memory),
      safety: answer.safety && typeof answer.safety === "object" ? answer.safety : {},
      model: upstream.model || config.MIMO_MODEL,
      requestId: upstream.requestId || ""
    };
  }

  _normalizePayload(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
    const clean = Object.assign({}, payload);
    const allowedTypes = ["dietLog", "workoutPlan", "profilePatch"];
    const allowedStatuses = ["pending", "cancelled"];
    clean.proposals = (Array.isArray(payload.proposals) ? payload.proposals : [])
      .slice(0, 3)
      .map(item => {
        if (!item || typeof item !== "object") return null;
        const type = allowedTypes.includes(item.type) ? item.type : "";
        if (!type) return null;
        return {
          id: String(item.id || "").slice(0, 80),
          type,
          status: allowedStatuses.includes(item.status) ? item.status : "pending",
          summary: String(item.summary || "").slice(0, 160),
          payload: this._plainObject(item.payload)
        };
      })
      .filter(Boolean);
    return clean;
  }

  _recoverJsonFields(text) {
    const typeMatch = text.match(/"type"\s*:\s*"(diet|training|general)"/i);
    const titleMatch = text.match(/"title"\s*:\s*"((?:\\.|[^"\\])*)"/i);
    const contentMatch = text.match(/"content"\s*:\s*"((?:\\.|[^"\\])*)"/i);
    const decode = value => {
      if (!value) return "";
      try {
        return JSON.parse(`"${value}"`);
      } catch (err) {
        return value;
      }
    };
    return {
      type: typeMatch ? typeMatch[1].toLowerCase() : "general",
      title: decode(titleMatch && titleMatch[1]) || "AI 教练建议",
      content: decode(contentMatch && contentMatch[1]),
      payload: {},
      memory: {},
      safety: {}
    };
  }

  _plainAnswer(content) {
    return {
      type: "general",
      title: "AI 教练建议",
      content: this._cleanDisplayContent(content),
      payload: {},
      memory: {},
      safety: {}
    };
  }

  _cleanDisplayContent(content) {
    let text = String(content || "").trim();
    if (/^\s*\{/.test(text) && /"content"\s*:/.test(text)) {
      const recovered = this._recoverJsonFields(text);
      if (recovered.content) text = recovered.content;
    }
    return text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .trim();
  }

  _normalizeMemory(memory) {
    if (!memory || typeof memory !== "object") return {};
    return {
      profilePatch: this._plainObject(memory.profilePatch),
      bodyStats: this._plainObject(memory.bodyStats),
      exerciseLog: this._plainObject(memory.exerciseLog),
      dietLog: this._plainObject(memory.dietLog),
      observation: String(memory.observation || "").slice(0, 1000)
    };
  }

  _plainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const clean = {};
    for (const key of Object.keys(value).slice(0, 40)) {
      if (key === "__proto__" || key === "prototype" || key === "constructor") continue;
      clean[String(key).slice(0, 60)] = value[key];
    }
    return clean;
  }
}

module.exports = AiAgentAdapter;
