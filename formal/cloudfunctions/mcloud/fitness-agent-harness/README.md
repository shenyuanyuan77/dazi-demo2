# Fitness Agent Harness

生产级 Agent Harness 已接入云函数 `ai/send` 链路：

```text
小程序聊天页 / 图片上传
-> cloudfunctions/mcloud/project/dazi/controller/ai_controller.js
-> AiService.sendMessage
-> fitness-agent-harness runtime
-> 必要时调用 MiMo
-> 返回 answer.payload.agentHarness / proposals / trace
```

## 运行时职责

- 意图识别：饮食记录、饮食建议、训练计划制定、训练记录、训练计划修改、身体数据分析、确认、取消、越界。
- 写入安全：所有写入先生成 `pendingWrite`，只在当前 session 用户明确确认后调用写工具。
- 工具系统：读写工具均有 schema、权限级别和结构化 `ToolResult`。
- 记忆与状态：每轮保留 `AgentState`，包含短期记忆、pendingWrite、工具调用历史、记忆读写历史、错误历史。
- Trace：每轮响应在 `answer.payload.agentHarness.trace` 中输出关键阶段。
- Eval：`eval/runner.js` 可独立跑回归用例，不依赖外部模型。
- QA-pairs：`eval/qa_runner.js` 跑成对问答用例，专门约束回复边界、拒答、只读分析和反幻觉行为。

## 云函数接入

`AiService.sendMessage` 会先运行 harness：

- `UNSUPPORTED / CONFIRM_WRITE / CANCEL_WRITE / DIET_RECORD / TRAINING_RECORD` 等可确定场景直接由 harness 返回。
- `DIET_SUGGESTION / TRAINING_PLAN_CREATE / TRAINING_PLAN_UPDATE / 部分 BODY_ANALYSIS` 会继续调用 MiMo，并把 harness 的 pendingWrite、trace、validation 合并到模型回答。
- 确认写入时，harness 使用 `diet.log.create / training.log.create / training.plan.create / body.metric.create / user.profile.update` 等工具落到现有 `AI_LOG / AI_PROFILE`。

## 运行评测

在仓库根目录直接执行上线门禁：

```bash
node cloudfunctions/mcloud/fitness-agent-harness/eval/operational_gate.js
```

如果本地或 CI 环境有 npm，也可以在 `cloudfunctions/mcloud` 目录执行同一个门禁：

```bash
npm test
```

运行结构化回归：

```bash
node cloudfunctions/mcloud/fitness-agent-harness/eval/runner.js
```

运行成对问答大规模测试：

```bash
node cloudfunctions/mcloud/fitness-agent-harness/eval/qa_runner.js
```

报告输出到：

```text
cloudfunctions/mcloud/fitness-agent-harness/eval/last-report.json
cloudfunctions/mcloud/fitness-agent-harness/eval/last-qa-report.json
cloudfunctions/mcloud/fitness-agent-harness/eval/last-operational-gate.json
```

`operational_gate.js` 会同时验证：

- 结构化 eval 全绿，且不少于 25 个 turn。
- QA-pairs 全绿，且不少于 75 条。
- QA-pairs 覆盖饮食、训练、身体分析、确认、越界拒答等关键类别。
- 越界拒答类 QA 不少于 20 条。
- 每条 QA 都有唯一 `id`、合法 `category`、`question`、`expect` 和人工可读的 `expectedAnswer`。
- harness JS 与云函数 AI 接入点语法检查通过。
- adapter 出口合约测试通过，模型原文不能绕过 pendingWrite、拒答和未确认写入约束。

GitHub Actions:

`.github/workflows/fitness-agent-harness.yml` 会在相关路径的 PR / push 上运行同一个 operational gate，并上传三份报告 artifact。

## 扩展方式

1. 新增工具：更新 `runtime/tools/tool_schemas.js`，并在云函数接入处提供真实 handler。
2. 新增意图：更新 `shared/types/agent_types.js`、`runtime/parser/intent_parser.js`、`runtime/context/context_policy.js` 和 orchestrator。
3. 新增验证规则：扩展 `runtime/validators/validators.js`，eval 会自动读取 `validationResult`。
4. 新增结构化回归：在 `eval/cases/*.json` 添加测试用例。
5. 新增问答回归：在 `eval/qa-pairs/*.json` 添加 question / expectedAnswer / expect。
