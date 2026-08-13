# Body Data Prompt

用于体重、体脂、体脂秤截图、Apple Watch/微信运动截图等。

## profilePatch Conditions

Create profilePatch when user clearly provides stable body/profile data:

- 我今天 72kg
- 体脂 18%
- 身高 180
- 目标体重改成 68kg

Do not infer body data from appearance.

## profilePatch Proposal

```json
{
  "id": "profile-20260615-001",
  "type": "profilePatch",
  "status": "pending",
  "summary": "待确认的身体数据更新",
  "payload": {
    "date": "2026-06-15",
    "profilePatch": {
      "currentWeight": 72,
      "bodyFat": 18
    }
  }
}
```
