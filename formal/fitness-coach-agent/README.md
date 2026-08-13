# Fitness Coach Agent Refactored

这是面向微信小程序「AI 教练」的 Agent 结构重构版。

目标是解决这些问题：

- 训练计划被错误识别成饮食记录。
- 用户补充说明被当成训练动作名。
- 图片识别失败后仍然生成错误草稿。
- 模型自然语言输出需要前端猜测，导致 proposal 类型混乱。
- 写入前缺少统一 schema 和 validator。

## 目录结构

```text
fitness-coach-agent-refactored
├── AGENTS.md                  # Agent 总规则
├── MODEL.md                   # 模型接入和运行配置
├── USER.md                    # 用户长期资料
├── SOUL.md                    # 语气和人格
├── MEMORY.md                  # 长期记忆
├── prompts                    # 分任务提示词
├── schemas                    # 严格结构化输出协议
├── validators                 # 前端/云函数均可复用的校验器
├── services                   # 意图路由、proposal 构造、修补逻辑
├── tools                      # Tool / Skill 定义
├── data                       # 用户记录数据
├── plans                      # 当前饮食/训练计划
└── examples                   # 测试输入输出样例
```

## 推荐运行链路

```text
用户输入 / 图片
→ intent_router
→ task_prompt
→ MiMo v2.5 / mimo-v2-flash
→ structured proposal JSON
→ validate_proposal
→ 展示确认卡片
→ 用户确认
→ write_service 写入数据库
```

## 最重要的规则

1. 模型必须输出结构化 JSON，不能让前端从自然语言里猜类型。
2. proposal 类型只能是 `dietLog`、`workoutPlan`、`profilePatch`。
3. 写入前必须经过用户确认。
4. 训练动作名不能包含「我想、我是说、帮我、安排、训练计划、改成」等用户意图表达。
5. 饮食、训练、身体数据必须用不同 schema 校验。
