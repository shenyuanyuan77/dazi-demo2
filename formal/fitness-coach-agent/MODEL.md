# Model Configuration

## Provider

Xiaomi MiMo OpenAI-compatible API.

## Routing

```text
text-only simple answer       -> mimo-v2-flash
text + image                  -> mimo-v2.5
proposal generation           -> mimo-v2.5 preferred
strict schema repair          -> mimo-v2-flash or local validator
```

## Runtime Settings

```text
endpoint = https://api.xiaomimimo.com/v1/chat/completions
temperature = 0.25 for proposal generation
temperature = 0.35 for general coaching answer
max_tokens = 1800
timeout = 60000ms
images <= 3
```

## Required Env

```text
MIMO_API_KEY=<server-side only>
MIMO_BASE_URL=https://api.xiaomimimo.com/v1/chat/completions
```

API Key 必须放在云函数环境变量中，禁止放入小程序前端。

## Output Requirement

模型输出必须是 JSON object。禁止输出 Markdown 包裹 JSON。

最外层格式：

```json
{
  "type": "answer",
  "answer": "中文回复",
  "payload": {
    "intent": {
      "intent": "answer",
      "domain": "general",
      "responseMode": "answer_only"
    },
    "proposals": []
  }
}
```
