# COS University — A-Range Evidence Layer

Date: 2026-09-07

## Purpose

This slice implements the evidence stages above ordinary unseen subject examinations. It does not manufacture elite grades from learning volume, benchmarks, simulations, or historical telemetry.

Academic progression remains:

- repeated fresh unseen subject evidence -> B;
- repeated materially distinct cross-domain transfer -> A-;
- repeated exact-turn independently verified real Production transfer -> A;
- repeated materially distinct multidisciplinary capstone -> A+.

A+/graduation remains continuing qualification, not the end of learning.

## Repeated evidence rule

A transfer, Production, or capstone stage requires at least two distinct successful pieces of evidence after the latest failure at that stage. Duplicate variants do not count twice. A later independently verified failure resets the stage until it is re-earned.

The A-range run ledger records individual evidence. `cos_university_assessments` receives a positive stage assessment only after the threshold is satisfied. A failure is written immediately so existing transcript logic revokes the stage.

## Cross-domain transfer

Cross-domain exams are server-seeded, host-scored, cache-disabled, local-model-only, and tied to the exact COS turn. Each case combines a primary subject with two independently selected companion subjects and randomized operational facts. The response must preserve facts, surface uncertainty, and integrate the named domains rather than solve a repeated single-domain fixture.

Raw prompts, hidden rubrics, and replies are not persisted in the A-range run ledger.

## Verified Production transfer

Production credit is prospective and fail-closed.

Only `cos_turn_outcomes` carrying an explicit source in the namespace `production_verified:<provider-or-workflow>:<reference>` can enter the University Production bridge. The exact `turn_id` must resolve to a durable COS turn experience and a classifiable University subject.

The bridge mechanically rejects benchmark, acceptance, rehearsal, validation, comparison, retest, exam, test, synthetic, simulation, fixture, and mock sources even if they carry `verified_success=true`.

A Production outcome is not an exam. It may be produced only by a real operational workflow that has independently verified the outcome and deliberately uses the `production_verified:` namespace. Historical benchmark successes are not backfilled.

Production inspection performed before this implementation found no existing outcomes eligible under this contract. Therefore no A-grade Production evidence is fabricated at launch.

## Multidisciplinary capstone

Capstones are host-controlled and become eligible only after the subject has earned fresh verified Production-transfer standing. Each capstone integrates the primary subject with five additional University subjects and requires an executable recommendation, explicit evidence limits, uncertainty, interactions/trade-offs, and verification.

Two distinct capstone passes after the latest capstone failure are required before the capstone stage is written as passed.

## Cadence

- 06:30 UTC — University learning/planning
- 07:00 UTC — independent unseen subject/language examination
- 07:10 UTC — A-range Production bridge + eligible transfer/capstone examination

Feature switch: `COS_UNIVERSITY_A_RANGE_ENABLED=true`.

## Security and academic integrity

`public.cos_university_a_range_runs` is service-only with RLS enabled. Anonymous and authenticated roles receive no table privileges.

It intentionally has no raw prompt, rubric, reply, or grade column.

The learner may study and improve. It may not author the server seed, change the host scorer verdict, self-declare Production verification, or directly write its own letter grade.

## Scope limit

This slice provides A-range evidence for the thirteen University subjects, including the Language & Communication academic subject. The five platform languages remain separate competencies and must not be averaged into that subject. Their own A-range multilingual transfer/capstone progression is a later language-specific slice; no strong English result may compensate for Spanish, Portuguese, Polish, or Russian.
