# Tools Schema

工具定义见 `runtime/tools/tool_schemas.js`。核心约束：

| Tool | Type | Confirmation |
| --- | --- | --- |
| `user.profile.get` | read | no |
| `user.profile.update` | sensitive_write | yes |
| `diet.log.create` | write | yes |
| `diet.log.query` | read | no |
| `diet.analyze` | read | no |
| `training.plan.create` | write | yes |
| `training.plan.get` | read | no |
| `training.plan.update` | write | yes |
| `training.log.create` | write | yes |
| `training.log.query` | read | no |
| `body.metric.create` | write | yes |
| `body.metric.query` | read | no |
| `body.analyze` | read | no |
| `vision.food.recognize` | read | no |
| `vision.bodyScale.ocr` | read | no |
| `wechat.login` | read | no |
| `wechat.profile.sync` | sensitive_write | yes |

写工具失败时，runtime 会保留待确认项并返回可重试提示；不会把失败结果写入长期记忆。
