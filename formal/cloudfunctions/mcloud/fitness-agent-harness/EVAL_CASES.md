# Eval Cases

用例位于 `eval/cases/`，当前覆盖：

- 饮食记录：4 个
- 饮食建议：3 个
- 训练计划制定：3 个
- 训练记录：4 个
- 训练计划修改：2 个
- 身体数据分析：2 个
- 非支持问题：2 个
- 多轮取消/确认：1 个

成对问答用例位于 `eval/qa-pairs/`，当前 78 条，覆盖：

- 饮食记录、饮食建议、图片只读分析
- 训练记录、训练计划制定、训练计划修改
- 身体数据分析、体脂秤 OCR、只读分析
- 无 pendingWrite 的确认
- 泛问答、投资、代码、旅游、写作、天气、法律等不支持问题拒答

断言支持：

- `intent`
- `mustCallTools`
- `mustNotCallTools`
- `mustWriteDb`
- `mustNotWriteDb`
- `dbShouldChange`
- `pendingWrite`
- `replyShouldContain`
- `replyShouldNotContain`
- `slotsShouldContain`

QA-pairs 额外断言：

- `mustNotCreatePendingWrite`
- `mustAskConfirmation`
- `mustRefuseUnsupported`
- `forbidUnsupportedExpansion`
- `traceMustInclude`
- `maxReplyChars`

上线门禁：

```bash
node cloudfunctions/mcloud/fitness-agent-harness/eval/operational_gate.js
```

有 npm 的环境也可以在 `cloudfunctions/mcloud` 目录运行 `npm test`。门禁脚本 `eval/operational_gate.js` 会运行结构化 eval、QA-pairs eval、adapter 出口合约测试、语法检查和覆盖阈值检查。

CI 门禁位于 `.github/workflows/fitness-agent-harness.yml`，相关路径的 PR / push 会自动运行同一命令。
