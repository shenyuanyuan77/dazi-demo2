# Intent Router Prompt

请只输出 intent JSON。

## Allowed Intents

```text
diet_image_recognition
diet_text_logging
diet_advice
workout_plan_generate
workout_log_record
body_data_recognition
body_data_update
modify_pending_proposal
health_summary
answer
clarify
```

## Output

```json
{
  "intent": "workout_plan_generate",
  "domain": "training",
  "responseMode": "generate_proposal",
  "confidence": 0.92,
  "targetProposalType": "workoutPlan",
  "reason": "用户请求安排训练计划"
}
```

## Routing Rules

- “拍照记饮食” -> `diet_image_recognition`
- “生成今日饮食建议” -> `diet_advice`, proposals must be empty unless user explicitly asks save as consumed meal
- “安排居家训练” -> `workout_plan_generate`
- “改成练腿，做六组” and previous proposal is workoutPlan -> `modify_pending_proposal`
- “我今天体重 72kg” -> `body_data_update`
- “我中午吃了鸡腿饭” -> `diet_text_logging`

## Disambiguation

If text contains both kcal and training signals, training wins when it includes:

```text
训练计划 / 训练安排 / 动作 / 组 / 次 / 休息 / 俯卧撑 / 深蹲 / 臀桥 / 平板支撑
```
