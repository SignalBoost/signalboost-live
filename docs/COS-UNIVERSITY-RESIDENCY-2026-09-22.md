# COS University Residency v1

**Date:** September 22, 2026  
**First program:** Builder / Computer Science  
**Status:** formal-education harness foundation

Residency is not a post-graduation gate. It is the practical harness inside formal University education.

The target lifecycle is:

~~~text
Curriculum
-> classroom / distillation
-> trained student artifact
-> practical Residency harness
-> supervised failure / correction / remediation / retraining as needed
-> exact-artifact canary
-> independent final examinations
-> graduation
-> governed practice
~~~

The boundary is deliberate:

- **Residency teaches.**
- **Independent evaluation examines.**
- **Referee/governance authorizes.**

Residency may expose a student to realistic supervised work, let it fail, diagnose competency gaps, generate targeted curriculum and cause retraining. Hidden final-examination cases, rubrics and evaluator outputs must never be copied into Residency material or retained training data.

Residency does not grant authority. Referee, signed manifests, host policy, runtime scopes, approvals, spend limits and other deterministic controls remain authoritative.

## Builder Residency competencies

The first program records evidence for repository navigation, root-cause debugging, implementation repair, database diagnosis, deployment recovery, browser debugging, tool/MCP selection, test and regression prevention, recovery from the resident's own failed diagnosis or repair, authority/uncertainty judgment, and cross-specialist collaboration.

Competence is case-based rather than task-count based. Duplicate case fingerprints do not create additional evidence.

The state progression is:

~~~text
unproven -> supervised -> demonstrated -> retained
~~~

A verified Residency failure changes that competency to `remediation_required` until materially distinct newer supervised cases demonstrate recovery.

Residency completion requires every Builder competency to reach at least `demonstrated`. Retention strengthens the competency record without widening authority.

## Relationship to the existing apprenticeship work

The September 21 apprenticeship design correctly identified realistic Builder work and objective outcomes, but its sequence placed that work after graduation. Residency moves the teaching portion earlier.

The existing Builder/tool infrastructure remains useful as the execution substrate, but Residency must use isolated/sandboxed authority and supervised cases. Production outcomes after graduation remain continuing-education evidence, not the Residency itself.

## Safe rollout

Residency enrollment and telemetry start in **shadow mode**. `COS_UNIVERSITY_RESIDENCY_FINAL_GATE_ENABLED=false` means the existing canary/evaluation pipeline remains unchanged while the supervised practical case runner is built and proven. Once that runner is operational, the gate can be enabled; from that point an enforced Builder enrollment must complete Residency before a fresh post-Residency exact-artifact canary and independent final examination may be claimed.

This prevents introducing a new educational requirement before there is a working way for students to satisfy it.

## First implementation

This version adds:

1. `cos_university_residency_enrollments` bound to trained artifact rows rather than graduate rows;
2. `cos_university_residency_competency_evidence`;
3. the Builder Residency competency state machine;
4. automatic admission of trained Computer Science artifacts awaiting final evaluation;
5. an explicit, shadow-safe rule that Builder final evaluation is not ready until Residency is complete once final-gate enforcement is enabled;
6. anti-duplication, remediation and retention rules;
7. Production-path telemetry for the Residency lane.

The next implementation step is the actual controlled Builder case runner: use sandboxed repository/browser/database/deployment exercises, record exact-artifact competency evidence, and feed verified Residency failures back into targeted remediation without exposing final-exam material.
