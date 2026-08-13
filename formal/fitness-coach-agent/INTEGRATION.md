# Integration Guide

## 1. Mini Program / Cloud Function Flow

```text
ai_chat.js
→ cloudfunctions/ai/send
→ services/intent_router.routeIntent
→ build MiMo prompt using prompts/system_prompt.md + task prompt
→ parse model JSON
→ validators/validateAssistantOutput
→ return answer + proposals to mini program
```

## 2. Replace Frontend Guessing

Do not let the frontend infer proposal type from natural language.

Bad:

```js
if (answer.includes("kcal")) type = "dietLog";
```

Good:

```js
const proposal = assistant.payload.proposals[0];
if (proposal.type === "workoutPlan") renderWorkoutCard(proposal);
```

## 3. Runtime Validation

Before showing save button:

```js
const errors = validateProposal(proposal);
if (errors.length) {
  showRepairOrEditCard(errors);
  return;
}
```

Before writing database:

```js
if (proposal.status !== "confirmed") throw new Error("WRITE_REQUIRES_CONFIRMATION");
```

## 4. Fix for Current Bug

The current bug is:

```text
训练计划内容含有 kcal
→ fallback sees kcal
→ generates dietLog
```

Correct rule:

```text
If text contains 训练计划/动作/组/休息, create workoutPlan.
Estimated kcal in workout text is exercise calorie output, not food intake.
```
