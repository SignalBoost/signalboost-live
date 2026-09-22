# COS University Residency v1

**Date:** September 22, 2026  
**First program:** Builder / Computer Science  
**Status:** implementation foundation

Residency is the practical training stage between academic qualification and broader specialist standing.

~~~text
Curriculum
-> Distillation / Training
-> Independent academic evaluation
-> Exact-artifact canary + rollback proof
-> Runtime identity proof
-> Residency
-> Competency evidence
-> Residency completion
-> Governed specialist practice
~~~

Residency does not grant authority. Referee, signed manifests, host policy, runtime scopes, approvals, spend limits and other deterministic controls remain authoritative.

## Builder Residency competencies

The initial Builder program records evidence for repository navigation, root-cause debugging, implementation repair, database diagnosis, deployment recovery, browser debugging, tool/MCP selection, test and regression prevention, recovery from the resident's own failed diagnosis or repair, authority/uncertainty judgment, and cross-specialist collaboration.

Competence is case-based rather than task-count based. Duplicate case fingerprints do not create additional evidence.

The state progression is:

~~~text
unproven -> supervised -> demonstrated -> retained
~~~

A verified failure changes that competency to remediation_required until materially distinct, newer verified successes demonstrate recovery.

Residency completion requires every Builder competency to reach at least demonstrated. Retention is recorded separately and can strengthen current standing without widening authority.

## Relationship to existing apprenticeship

The September 21 real-world apprenticeship machinery remains the execution substrate for bounded practical work. Residency formalizes what apprenticeship previously lacked: a durable program enrollment, competency ledger, anti-duplication identity, remediation state, and explicit completion decision.

Existing graduate activation and Builder routing are intentionally not weakened. A resident may use only the already-declared bounded worker/problem scope, and Residency itself records authority_expanded=false.

## First implementation

This version adds the residency enrollment ledger, competency-evidence ledger, Builder Residency state machine, automatic enrollment of an eligible active Computer Science graduate, and tests for admission, duplicate-case resistance, remediation, retention and completion.

The next implementation step is to bind verified Builder task outcomes into the competency-evidence ledger and let the University automatically select gap-filling residency cases.
