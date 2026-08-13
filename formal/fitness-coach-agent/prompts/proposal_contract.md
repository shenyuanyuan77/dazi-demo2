# Proposal Contract

## Top-Level Assistant Output

```json
{
  "type": "diet | training | profile | answer",
  "answer": "中文回复",
  "payload": {
    "intent": {},
    "proposals": []
  },
  "safety": {
    "level": "none",
    "message": ""
  }
}
```

## Proposal

```json
{
  "id": "stable-id",
  "type": "dietLog | workoutPlan | profilePatch",
  "status": "pending | confirmed | cancelled",
  "summary": "short Chinese summary",
  "payload": {}
}
```

## Rule

- First output must be `pending`.
- Only after user confirms can same proposal become `confirmed`.
- Rejection becomes `cancelled`.
- Frontend/runtime ignores unconfirmed proposals for persistence.
