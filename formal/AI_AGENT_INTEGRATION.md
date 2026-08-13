# AI Agent 接入说明

## 当前模型

Fitness Coach 已接入 Xiaomi MiMo 官方 API：

```text
Provider: Xiaomi MiMo
Display name: MiMo-V2.5
API model ID: mimo-v2.5
Endpoint: https://api.xiaomimimo.com/v1/chat/completions
```

选择 `mimo-v2.5` 是为了支持文本与图片理解。用户上传多张图片时，云函数会将微信云存储文件转换成临时 HTTPS URL，并按照 OpenAI 兼容协议的 `image_url` 内容格式发送给模型。

## 云函数环境变量

在腾讯云 `mcloud` 云函数的“环境变量”配置界面中逐项添加。左侧填写变量名，右侧填写变量值：

```text
变量名 MIMO_API_KEY   变量值 你的 Xiaomi MiMo API Key
变量名 MIMO_MODEL     变量值 mimo-v2.5
变量名 MIMO_BASE_URL  变量值 https://api.xiaomimimo.com/v1/chat/completions
变量名 MIMO_TIMEOUT   变量值 60000
```

项目不再提供 mock 回复。未配置 `MIMO_API_KEY` 时请求会明确失败，不会生成任何本地伪造的 AI 内容。

API Key 只能填写在 `MIMO_API_KEY` 的变量值中，不得写入小程序代码、`config.js`、变量名或代码仓库。

## 多模态链路

```text
微信小程序选择图片
-> 上传至腾讯云存储
-> mcloud 获取临时 HTTPS URL
-> 组装 image_url + text 消息
-> 调用 mimo-v2.5
-> 解析 Fitness Coach JSON
-> 保存会话、结构化结果与记忆
```

当前前端单条消息最多上传 3 张图片。后端同时恢复最近会话中的用户图片，以支持基于历史图片继续追问。

## 响应协议

模型必须返回一个 JSON 对象，不使用 Markdown 代码块：

```json
{
  "type": "diet | training | general",
  "title": "移动端短标题",
  "content": "中文回复",
  "payload": {},
  "memory": {
    "profilePatch": {},
    "bodyStats": {},
    "exerciseLog": {},
    "dietLog": {},
    "observation": ""
  },
  "safety": {
    "level": "none | caution | urgent",
    "message": ""
  }
}
```

## 部署检查

1. 在 Xiaomi MiMo 控制台创建 API Key。
2. 在腾讯云云函数配置上述环境变量。
3. 重新上传并部署 `mcloud`，选择云端安装依赖。
4. 使用纯文本消息验证基础对话。
5. 分别使用相机、相册和多图消息验证图片理解。
6. 在历史会话中继续询问上一张图片，验证图片上下文恢复。

官方文档：

- https://mimo.mi.com/docs/zh-CN/quick-start/summary/first-api-call
- https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/multimodal-understanding/image-understanding
