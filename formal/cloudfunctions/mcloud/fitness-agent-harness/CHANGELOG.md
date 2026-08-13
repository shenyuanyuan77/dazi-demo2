# Change Log

## 2026-07-03

- Added Agent Harness runtime inside `cloudfunctions/mcloud/fitness-agent-harness`.
- Integrated harness into `AiService.sendMessage`.
- Added schemas, state, memory policy, guardrails, validators, mini program answer adapter and eval runner.
- Added 21 regression cases covering supported capabilities, write confirmation, tool routing, unit conversion and unsupported fallback.
- Added QA-pairs evaluation runner with 78 question/expected-answer pairs for hallucination, unsupported-scope, read-only, confirmation, image-tool and unit-conversion checks.
- Hardened intent routing for "只分析/不要保存/不用记录", common training actions, diet-advice phrasing and unsupported non-health tasks.
- Added operational gate script and npm test entrypoint to run both eval suites, syntax checks and minimum coverage thresholds before release.
- Added GitHub Actions workflow for the harness operational gate and stricter QA-pair metadata checks.
- Added adapter answer-contract enforcement and tests so model-assisted responses cannot claim writes before confirmation or expand unsupported answers.
