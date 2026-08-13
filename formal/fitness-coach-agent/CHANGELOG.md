# Refactor Changelog

## 2026-06-15

- Added strict intent router structure.
- Added separate prompts for diet, workout, body data, and proposal contract.
- Added JSON schemas for proposal, dietLog, workoutPlan, profilePatch, and intent.
- Added validators to prevent training content from becoming diet records.
- Added validator to reject user intent text as exercise name.
- Added proposal builder service with separate diet/workout/profile creation.
- Added proposal patch service for modifying pending workout plans.
- Added integration guide for mini-program runtime.
