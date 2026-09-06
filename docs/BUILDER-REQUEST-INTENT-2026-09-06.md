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

Review follow-through: the semantic classifier now returns explicit write targets, excluding reference/preserved documents; the host validates them against mentioned plain-document paths and explicit preservation clauses. Runner-generated lockfiles remain ephemeral in documentation mode and cannot be persisted. Regression coverage verifies both restrictions. The older narration assertion was updated to require accurate incomplete-task wording while retaining no-false-success checks; the complete 1874-test CI unit suite then passed locally.

After review repairs: all 1017 mandatory regressions and TypeScript pass; 61 focused intent/evidence/narration tests pass. Final exact-head CI/Preview and live acceptance remain pending.

## Integrated deployment and live results

#1910 initially had an older narration-test assertion failure, then a serialization/ONBOARD conflict after #1911 merged. Both were repaired without weakening gates or losing the domain work. Integrated head `b1851cc0feeb050658d8fe3658df66032f3e1264`, tree `b8aa7cfbfc8451194ca4b1d6c12155d1c52d597b`, passed all 1018 mandatory regressions, TypeScript, twelve distinct CI workflows, and Preview `dpl_J44UozXPr81q2q2HytWAKWAdikh5` READY, with zero unresolved review threads. Merge `f741c7b0e0755f5123b28ddd1b8495264476c298` reached Production READY as `dpl_FJdnwBMq2hrAkxW8c5boryZ2xBzg`.

Repeating the original missing-input README request created job `a2edcc5c-67f1-44ab-8b43-abd0bca057c6`, succeeded. Runtime recorded `builder_documentation_intent` accepted true, one path. Its trace contains one npm test, exit zero, fifteen passing tests, no mutation. README already contained the requested section from the prior failed job and retained fingerprint `14463e173011e246f5958bb55563400cd533119a842e29da7b0504315592a6f5`. The response incorrectly described this as a new extension followed by verification. The intent/status fix is accepted for this sample; no-new-edit attribution is not accepted. The old failed job remains failed in history.

A fresh request to extend README with an Invalid amount troubleshooting subsection created job `f93d8ddd-3c5f-4032-912d-32aaadee5ae5`, succeeded. Round one edited only README; round two npm test exited zero with fifteen passing tests. The added guidance accurately describes nonnumeric posted amounts and excluded void entries. README changed to `86c63901faa47adb303e621897263b2db9583cd17f37cf8abac4ea53cfbba82d`; all seven other file fingerprints, including report.test.js and both package files, matched the preceding run. The model returned a useful explanation of this recorded edit and passing tests. Preservation is established here by comparing fingerprints across runs and the mutation trace, not by current-versus-last-run identity alone.

The exact Does-question about job `e22206f9-7008-41c5-aba7-5f0bb880e691` now entered scoped Builder evidence and answered that historical money.js identity is unavailable because the legacy job has no saved snapshot/fingerprint. It kept npm test exit zero separate from identity evidence. The latest job remained `f93d8ddd-3c5f-4032-912d-32aaadee5ae5`, proving the question created no new job.

Next: current-job change attribution when a repeated request needs no new mutation, followed by useful broad legacy narration. These finite observations do not establish universal conversation, reasoning, or inference-transfer reliability.
