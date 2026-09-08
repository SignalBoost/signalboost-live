# COS University — Deliberate Practice Bridge

Date: 2026-09-08

## Purpose

This slice closes the gap between **studying** and **being independently examined**.

The University loop becomes:

```text
verified weakness / transcript gap
→ Learning Strategist chooses study method
→ governed acquisition / study
→ deliberate practice on fresh variants
→ measured practice result
→ if weak: study again, then a new practice round
→ if strong: ready_for_exam
→ independent unseen exam remains separate
→ transfer / Production / capstone evidence remains separate
```

Practice is training evidence, not academic evidence.

## Machine cadence

AI agents do not need biological rest. The practice lane is offset from the 15-minute acquisition lane only to keep model/runtime budgets independent.

- University acquisition/study: every 15 minutes.
- University deliberate practice: minute 5, 20, 35, and 50 of every hour.
- Independent unseen examination remains a separate host-controlled lane.
- A-range transfer/Production/capstone remains a separate host-controlled lane.

The time offset is an orchestration boundary, not a rest period.

## Eligibility

A study plan is eligible for deliberate practice only when:

- it is already in `studying` state;
- at least one governed study/acquisition attempt is recorded;
- the Learning Strategist explicitly selected `deliberate_practice` with `automatic_if_certifiable` execution.

A plan that has never studied cannot skip directly into practice.

## Fresh practice rounds

Each recorded study attempt defines a new practice round.

A round contains two deterministic host-curated variants that are:

- reproducible for audit from the plan key and round;
- materially different from one another;
- different again after another study attempt;
- hidden from the learner until execution;
- scored with a deterministic rubric after the answer is produced.

If practice fails, the same failed prompt is not repeatedly drilled until memorized. COS must re-enter study, and the next study attempt produces a new practice round.

## Five platform languages

Language practice supports EN / ES / PT / PL / RU.

A non-English practice case is answered in its target language and is scored against target-language concepts plus the case facts. English-only rubric vocabulary cannot be required for Spanish, Portuguese, Polish, or Russian practice.

Language practice remains training only. Independent language exams continue to control academic language standing, and no language may compensate for another.

## Reuse of the cognitive practice engine

The bridge deliberately reuses mature COS cognitive infrastructure:

- `cos_cognitive_skills` supplies a durable practice-only skill identity;
- `cos_active_practice_queue` supplies claim/retry/terminal exercise state;
- `cos_record_cognitive_practice_result` records measured attempts and cognitive experiences;
- deterministic rubric scoring supplies practice measurement.

University practice skills are created with evaluator and understanding approval false. Therefore practice counts alone cannot make them validated/learned/mastered under the cognitive lifecycle.

## Academic integrity

Non-negotiable:

- practice does **not** write `cos_university_assessments`;
- practice does **not** call `recordCosUniversityAssessment`;
- practice does **not** award A/B/C or any other University grade;
- a local, fresh, non-cache COS execution is required for a measured practice attempt;
- external-AI execution or semantic-cache replay is deferred rather than counted as learner performance;
- infrastructure failure is deferred, not scored as an intellectual failure;
- two distinct successful variants in the current practice round are required before a plan becomes `ready_for_exam`;
- `ready_for_exam` stops passive rereading of that plan until examination/remediation supplies new evidence.

## Runtime behavior

The practice worker prepares at most four eligible plans and executes at most two model exercises per invocation. This keeps the model-call budget separate from the acquisition sweep, whose first Production run took 72 seconds.

A practice failure keeps the plan in `studying`. After the study cooldown, COS can study it again and receive a new practice round.

A fully passed round sets the plan to `ready_for_exam`. That state is readiness for independent testing, not proof of competence.

## Relationship to the full University loop

This bridge makes the middle of the loop real:

```text
learn → practice → measure
```

The next independent layer remains:

```text
ready_for_exam → unseen exam → transfer → Production evidence → capstone
```

The learner may improve itself continuously, but only host-controlled independent evidence may change its academic standing.
