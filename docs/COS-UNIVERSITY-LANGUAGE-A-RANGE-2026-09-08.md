# COS University — Five-Language A-Range Evidence

Date: 2026-09-08

## Purpose

This slice closes the A-range path that was intentionally left open by the first subject A-range implementation. English, Spanish, Portuguese, Polish, and Russian are independent University competencies; the broad `Language & Communication` subject cannot stand in for them.

The language progression is now executable:

```text
2 fresh unseen passes in each language dimension
  → repeated cross-domain transfer
  → repeated independently verified real Production outcomes
  → integrated multidisciplinary language capstone
  → A+
```

No language is averaged with another language, and no strong dimension hides a weak dimension.

## Cross-domain transfer

Cross-domain transfer is assessed separately for each of the five required dimensions:

- comprehension;
- writing;
- instruction following;
- translation/localization;
- cultural pragmatics.

A transfer target is eligible only after two fresh independent unseen passes in that exact language/dimension. The host creates a fresh hidden seed and randomized operational packet combining software/release state, security, regulatory/governance, finance, operations, and uncertainty. The learner must answer in the target language and preserve the supplied facts.

Two materially distinct passing variants after the latest failure are required before the transfer stage is recorded as passed.

## Verified Production transfer

Production language credit is prospective and explicit. Only exact-turn outcomes whose independently verified source uses this namespace are eligible:

```text
production_verified:language:<en|es|pt|pl|ru>:<dimension>:<reference>
```

The same anti-gaming filter rejects benchmark, acceptance, validation, rehearsal, retest, exam, test, synthetic, simulation, fixture, and mock evidence. The referenced turn must exist in the durable COS turn-experience ledger. The University consumer does not infer a language or dimension from prose and does not relabel ordinary success as Production language evidence.

Two distinct verified successes after the latest verified failure are required before the Production stage is recorded as passed for that language/dimension.

No historical outcome is backfilled. A real Production workflow must deliberately verify the result and emit the namespace above.

## Integrated language capstone

A language becomes capstone-eligible only after all five dimensions have current verified Production-transfer standing. The capstone is one integrated target for the language rather than five disconnected mini-capstones.

It requires the learner, entirely in the target language, to demonstrate:

- comprehension of a bounded multidisciplinary decision packet;
- executive writing;
- exact instruction-following through a structured action plan;
- localization without changing facts;
- culturally appropriate professional communication;
- security, regulatory, operational, financial, and uncertainty discipline.

Two distinct integrated capstone passes after the latest capstone failure are required. A valid pass writes capstone evidence to all five language dimensions; a later capstone failure revokes the capstone stage across all five until it is re-earned.

## Storage and security

Language A-range runs reuse `public.cos_university_a_range_runs`; there is no second academic database. The ledger gains a target discriminator plus language/dimension fields while preserving existing subject rows.

- subject target: `subject_id` only;
- language transfer/Production target: `language_code` + `language_dimension`;
- integrated language capstone: `language_code`, no single dimension.

The table remains service-role-only with RLS enabled. It still stores no raw prompt, hidden rubric, raw reply, or caller-supplied grade.

## Cadence

- 07:00 UTC — independent unseen subject/language examiner;
- 07:10 UTC — subject A-range / subject Production bridge;
- 07:20 UTC — five-language A-range / language Production bridge.

These are bounded orchestration lanes, not rest periods. Continuous learning remains independent and may continue in parallel.

## Graduation relationship

This slice does not declare COS graduated. It removes the missing runtime path that prevented the five required languages from ever earning A/A+ evidence.

The next University slice may build the A/A+ Generalist Graduation Gate from actual subject + language evidence. Graduation remains qualification for harder learning and specialization, not an end to learning.
