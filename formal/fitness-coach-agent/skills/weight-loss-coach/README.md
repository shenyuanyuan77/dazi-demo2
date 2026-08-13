# Weight Loss Coach Skill Integration

This project vendors the `weight-loss-coach-1.0.0.zip` skill as an internal coaching knowledge pack.

Integrated behavior:

- Weight-loss onboarding fields are collected progressively instead of asking everything at once.
- The runtime injects a session context summary built from profile, recent logs, durable observations, and pending proposals.
- The coach asks at most one blocking follow-up question per turn.
- Calorie, exercise, and recipe heuristics from the skill are exposed to the prompt as compact reference knowledge.

Source artifact:

- `/weight-loss-coach-1.0.0.zip`
- `/tmp_weight_loss_skill/SKILL.md`
