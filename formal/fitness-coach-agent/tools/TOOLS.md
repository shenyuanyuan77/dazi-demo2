# Tool Definitions

## food_image_analyze

Input:

```json
{ "imageUrls": ["https://..."], "locale": "zh-CN" }
```

Output:

```json
{
  "items": [
    { "name": "白米饭", "amount": 150, "unit": "g", "calories": 176, "protein": 3.9, "carbs": 38.9, "fat": 0.5, "confidence": 0.72 }
  ],
  "needUserConfirm": true
}
```

## exercise_search

Input:

```json
{ "focus": "legs", "equipment": ["bodyweight"], "level": "beginner" }
```

Output:

```json
{
  "exercises": [
    { "name": "深蹲", "target": "legs", "equipment": "bodyweight", "difficulty": "beginner" }
  ]
}
```

## diet_log_write / workout_plan_write / profile_update

Only run after proposal status is `confirmed` and validator returns no errors.
