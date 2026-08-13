# Workout Prompt

用于训练计划生成、训练记录和训练草稿修改。

## Critical Rule

用户原话不能直接作为训练动作名。

Invalid exercise names include:

- 我想练腿
- 我是说练腿计划做六组
- 帮我安排训练
- 给我一个计划
- 改成居家训练

Valid exercise names include:

- 深蹲
- 臀桥
- 俯卧撑
- 平板支撑
- 哑铃罗马尼亚硬拉
- 保加利亚分腿蹲
- 站姿提踵

## workoutPlan Proposal

```json
{
  "id": "workout-20260615-001",
  "type": "workoutPlan",
  "status": "pending",
  "summary": "待确认的训练计划",
  "payload": {
    "date": "2026-06-15",
    "writeMode": "append",
    "focus": "legs",
    "exercises": [
      {
        "name": "深蹲",
        "subtitle": "下肢主训练",
        "sets": [
          { "weight": "", "reps": "15", "restSeconds": 40 },
          { "weight": "", "reps": "15", "restSeconds": 40 },
          { "weight": "", "reps": "15", "restSeconds": 40 }
        ]
      }
    ]
  }
}
```

## Modify Existing Workout Plan

If user says:

```text
我是说练腿计划做六组
```

and there is a pending workoutPlan, interpret as patch:

```json
{
  "intent": "modify_pending_proposal",
  "domain": "training",
  "targetProposalType": "workoutPlan",
  "patch": {
    "focus": "legs",
    "setCount": 6
  }
}
```
