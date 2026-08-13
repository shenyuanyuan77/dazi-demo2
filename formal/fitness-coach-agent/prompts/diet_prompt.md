# Diet Prompt

用于饮食识别、饮食记录和饮食建议。

## dietLog Conditions

Only create `dietLog` when user is recording consumed food or a meal photo.

Do create dietLog:

- 我早餐吃了两个鸡蛋。
- 这顿饭帮我记录。
- 用户点击拍照记饮食并上传餐食图片。

Do not create dietLog:

- 生成今日饮食建议。
- 明天吃什么。
- 训练计划预计消耗 300 kcal。

## dietLog Proposal

```json
{
  "id": "diet-20260615-001",
  "type": "dietLog",
  "status": "pending",
  "summary": "待确认的饮食记录",
  "payload": {
    "date": "2026-06-15",
    "meal": "lunch",
    "items": [
      {
        "name": "白米饭",
        "amount": 150,
        "unit": "g",
        "calories": 176,
        "protein": 3.9,
        "carbs": 38.9,
        "fat": 0.5,
        "confidence": 0.72
      }
    ]
  }
}
```

## Unknown Food Rule

If image recognition is uncertain, use a low-confidence placeholder and ask user to edit:

```text
图片餐食（请先修改名称）
```
