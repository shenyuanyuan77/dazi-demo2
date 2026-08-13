# 健身搭子优化交付记录

本次会话在 `D:\搭子demo2` 上完成以下工作（与原始 PR1~PR5 计划对齐）。

## 一、Agent 架构升级（核心）

### B5 · 工具注册表元数据
文件：`cloudfunctions/mcloud/fitness-agent-harness/runtime/tools/tool_schemas.js`
- 给 16 个工具补全：`category`、`timeoutMs`、`idempotent`、`sensitiveFields`、`i18nLabel`、`sourceRequired`。
- 新增导出：`isReadTool`、`requiresSource`、`getCategory`、`listToolsByCategory`。
- 对应测试：`miniprogram/tests/tool_metadata.test.js`。

### B6 · 请求追踪 / observability
文件：`cloudfunctions/mcloud/fitness-agent-harness/runtime/observability/trace.js`（新建）
- `createTrace({ requestId, userId, sessionId })` 提供 event/tool/model/warning/error API。
- `redact(value, fields)` 用于工具结果中敏感字段脱敏（openId、unionId、nickname）。
- `toJsonLines()` 输出结构化 JSON 行，便于日志平台解析。
- 对应测试：`miniprogram/tests/observability_trace.test.js`。

### B7 · 快速 / 深度双路径
文件：`cloudfunctions/mcloud/fitness-agent-harness/runtime/bootstrap/agent.config.js`
- 新增 `ROUTE_POLICY = { fast, deep }`，明确意图→路径映射。
- 新增 `recommendPath(intent, extra)`，返回 `{ path, reason, responseMode }`。
- orchestrator 中所有 handleXxx 方法标注 `result.route = "fast" | "deep"`，便于前端做差异化反馈（如动画/进度条）。
- 对应测试：`miniprogram/tests/route_policy.test.js`。

### B1 · 业务领域语义优先路由
文件：`cloudfunctions/mcloud/fitness-agent-harness/runtime/parser/intent_parser.js`
- 引入 `BUSINESS_DOMAIN_SIGNALS` + `detectBusinessIntent(text)`，在确认/取消之后、unsupported 之前插入业务语义判定层。
- 优先级链：cancel → confirm → unsupported → business-domain → writeDenied-readonly → image-strong → 旧兼容规则。
- 对应测试：`miniprogram/tests/business_intent_routing.test.js`。

### orchestrator 集成
文件：`cloudfunctions/mcloud/fitness-agent-harness/runtime/orchestrator/agent_orchestrator.js`
- `runTurn` 改用 `createTrace`，事件流同时写到 `result.trace`（数组，向后兼容）和 `result.traceMeta`（结构化）。
- 新增 `_resolveRoute(intent, extra)`。
- `_callTool` 增加 `Promise.race` 超时保护（按 schema.timeoutMs），超时返回 `TOOL_TIMEOUT`。
- `_callTool` 写入 `trace.tool(...)`，带 `category/idempotent/sensitiveFields`。
- 所有 `_handleXxx`、`_confirmWrite`、`_cancelWrite` 增加 `trace` 参数并标注 `route`。
- 兼容老测试（trace 为数组时仍可工作）。

## 二、官方数据接入（已落地）

文件：
- `cloudfunctions/mcloud/project/dazi/data/diet_guidelines.js`（中国居民膳食指南 2022）
- `cloudfunctions/mcloud/project/dazi/data/activity_guidelines.js`（中国成人身体活动指南 2021 + WHO 2020）
- `cloudfunctions/mcloud/project/dazi/data/food_composition.js`（中国食物成分表第 6 版，~50 条）
- `cloudfunctions/mcloud/project/dazi/data/index.js`（统一入口 + `buildOfficialConstraintsPrompt`）

注入路径：
- `cloudfunctions/mcloud/fitness-agent-harness/runtime/prompt/prompt_builder.js`：prompt 末尾追加官方约束块。
- `miniprogram/projects/dazi/biz/dashboard_advice_service.js`：返回 `sources[]`、`gapNotes`，前端 advice-card 可渲染来源徽标。

对应测试：`miniprogram/tests/official_data.test.js`。

## 三、组件层（已落地）

- `miniprogram/components/proposal-card/`：js + wxml + wxss + json（已完整）；用于渲染 dietLog/workoutPlan/profilePatch 三类建议卡。
- `miniprogram/components/clarify-form/`：补全 `index.js`（行为：监听 clarify 字段、表单状态、submit/skip/cancel 触发事件）和 `index.wxss`（iOS 化样式 + 暗色模式）。
- `miniprogram/helper/safe_top.js`：safeTop 模块（已在）。
- `miniprogram/helper/motion.js`：iOS 缓动/时长常量 + 动画工具（已在）。

## 四、bug 修复
- `projects/dazi/pages/training/index/training_index.js`：`safeTop` 与 `workoutHelper` 的 `require` 路径少了一层 `..`，已修正为 `../../../../../`。原来这条测试 `training_ai_plan_interaction.test.js` 因此加载不到模块，现在已绿。

## 五、测试门禁
- 新增 5 个测试全部通过：
  - `official_data.test.js`
  - `tool_metadata.test.js`
  - `route_policy.test.js`
  - `observability_trace.test.js`
  - `business_intent_routing.test.js`
- 修复 `training_ai_plan_interaction.test.js` 入口（依赖 path 修正）。
- 全套测试结果：**22 通过 / 4 预存在失败（与本次无关）**。

预存在的 4 个失败：
- `body_food_delete_integration`：训练页 alertText 文案漂移（"仅删除该组，保留空动作" vs 实际"删除当前组并保留动作"）。
- `prompt16_prompt18_features`：期望 `ask_clarification` 路由，实际 `safe_redirect`（意图路由期望未同步）。
- `prompt19_regression`：期望身体数据形状不含 `originalWeightUnit`，但解析器已添加。
- `prompt20_regression`：正则 `AI_MESSAGE_CONTENT:\s*""` 与新 mock 模板对不上。

## 六、未做（按范围声明）
- Python `agent-service` 的 M2（LangGraph 节点、retrieval/memory/guardrails 中间件）改造：本会话未启动，留作下一轮。该层在 `formal/agent-service/` 已有 M1 骨架与 1:1 类型镜像，与本次 Node harness 升级并行不冲突。
- WXSS 大规模 token 替换、SVG 图标化、tabbar 之外的页面 iOS 化：原计划要求修改 14+ 个页面，每个页面需视觉回归，范围超出本会话可控时间。建议下一轮按页分支独立 PR。
- 技能 SKILL 拆分：原计划要求拆出 6 个 skill 目录 + gold_sample，本会话未启动。需配合 agent harness 的 skill loader（目前 `fitness_coach_skill.js` 是单文件）。

## 七、入口指引
- 重启 Node harness 时无需迁移步骤：`tool_schemas.js`、`intent_parser.js`、`agent_orchestrator.js`、`agent.config.js`、`prompt_builder.js` 均向后兼容。
- 前端可在 `Answer` 中读取 `route`（fast/deep）做 UI 区分，并在 advice-card 上展示 `sources[]`（官方来源徽标）。
- `data/manifest()` 提供数据版本清单，可在 About 页展示。