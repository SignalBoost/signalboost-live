# COS University — Independent Examination Layer

Date: 2026-09-07

## Purpose

This slice makes the University transcript earnable from host-controlled unseen examinations instead of remaining an empty academic schema.

## Exam boundary

Study and examination are separate systems.

- The learning planner may decide what COS should study.
- The learner never supplies a grade.
- The learner never supplies the exam seed or scorer verdict.
- A server-side seed creates a deterministic fresh exam manifest.
- The host scorer is versioned and deterministic.
- The normal privileged COS path executes the prompt with cache disabled.
- A valid exam requires recorded local-model provenance, no external-AI answer, no semantic-cache answer, a handled response, and an exact turn ID.
- Only then may pass/fail evidence be written to `cos_university_assessments` with scorer authority `host_private_exam`.
- A failed exam is attached to the exact turn outcome as `cos_university_exam:<run_id>`, allowing the existing failure-autopsy and University remediation loop to learn from it.

## Hidden exam evidence

`cos_university_exam_runs` is service-only and RLS protected. It stores the exam identity, target, seed, profile/scorer version, manifest hash, provenance flags, verdict, reasons, and latency.

It intentionally does **not** persist the raw exam prompt, hidden rubric, or model reply. The manifest is regenerated from the recorded seed and checked against the stored hash before execution, so generator drift fails closed.

## Coverage

The v1 unseen-exam generator covers all thirteen undergraduate subjects:

1. Computer Science & Coding
2. Mathematics
3. Statistics & Data Science
4. Physics & Natural Sciences
5. Cybersecurity
6. Politics, Government & International Relations
7. Social & Behavioral Sciences
8. Economics & Finance
9. Business & Operations
10. Law, Regulation & Governance
11. Language & Communication
12. History, Culture, Philosophy & Religion
13. Reasoning & Decision Science

It also covers each of EN/ES/PT/PL/RU independently across:

- comprehension;
- writing;
- instruction following;
- translation/localization;
- cultural pragmatics.

## Anti-lucky-pass rule

The durable database-backed transcript now requires **two fresh independent unseen passes** before a subject can stand at B or higher. Language standing similarly requires repeated unseen evidence for every required language dimension. This enforces the `SKILLS.md` rule that one successful exam is not mastery.

## Selection and cadence

The scheduled examiner selects two lanes per run:

- one least-proven undergraduate subject;
- one least-proven language/dimension.

This prevents the larger subject catalog from starving language education. The examiner is scheduled for 07:00 UTC, after the 06:30 UTC daily learning cycle. The kill switch is `COS_UNIVERSITY_EXAMS_ENABLED=true`.

## Recertification

Exam evidence expires by host-defined subject decay rate:

- 90 days: fast-changing technical/governance subjects such as computer science, cybersecurity, politics, and law;
- 120 days: business/economics/language-related standing;
- 180 days: statistics, physics/natural science, social science, and reasoning;
- 365 days: mathematics and history/culture/philosophy/religion;
- 120 days per platform-language dimension.

Expired rows no longer support the transcript.

## Scope limit

This is the independent **unseen subject/language examination** layer. It does not yet manufacture A/A+ standing. A-range grades still require cross-domain transfer, verified Production transfer where applicable, and capstone evidence under the existing University model. Those later stages remain separate host-controlled evidence classes.
