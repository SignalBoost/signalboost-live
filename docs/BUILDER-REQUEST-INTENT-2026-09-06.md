# Builder request intent — 2026-09-06

Observed job 97abd8c1-2211-4c2b-8dd0-3f6cff7f6e9e extended README with guidance about the existing missing-input-file error, then passed fifteen tests. Error vocabulary selected the code-repair gate, which required an unrequested failed baseline and marked the task failed. Its fallback incorrectly said proof had not passed. Separately, a Does-question about an explicit job's source identity entered generic answer-provenance handling instead of Builder evidence.

## Correction

For ambiguous repair-like standard jobs naming plain .md/.txt/.rst document paths, the configured governed Builder model classifies whether every requested mutation is documentation. Inspection and verification do not turn a documentation request into code repair; mixed implementation work must classify false. Unavailable/malformed/negative classification preserves the original gate. This is a bounded semantic decision, not a canned answer or alternate model.

The host derives at most six candidate paths from the original objective, validates the scope, and rejects every model-requested mutation outside it. Scope persists through continuation. Existing checkpoints without this scope retain their old behavior. Actual failed checks still activate repair handling; documentation mode cannot declare a failed command successful. The execution authority, runner policies and requested-command verification remain unchanged. Model misclassification can still limit task availability, but cannot use this mode to write implementation or tests.

Explicit job evidence questions with Does/Is/Are/Can openings now use the same read-only evidence classification as Explain. Generic prior-answer provenance remains available for genuine answer-origin questions. New execution directives still take precedence, and the existing user/conversation/job/workspace/repository checks remain authoritative.

Failure narration separates recorded passing commands from overall task completion. An unmet repair gate is no longer presented as a failed test, and an earlier passing check is not promoted to proof of later changes.

## Validation

Focused tests cover model true/false/malformed/unavailable results, host path restrictions, real Node verification of a documentation extension, blocked implementation writes, continuation scope, actual failed checks, Does/Is/Are routing, retained provenance behavior, explicit execution precedence, and passing-command versus task-gate narration. Full gates, TypeScript, exact Preview and live repeated requests remain required.

Local validation: 53 focused tests, all 1016 mandatory regressions and TypeScript passed after preserving concurrent #1908. Exact Preview/CI, Production and repeated live requests remain pending.
