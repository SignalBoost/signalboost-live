# COS University — A/A+ Generalist Graduation Gate

Date: 2026-09-08

## Purpose

This slice creates the University-level gate that answers one question with current evidence: **has COS earned the multidisciplinary generalist foundation required before graduate specialization?**

Graduation is not a permanent mutable flag. It is a derived current qualification that can be lost when evidence expires or a later independently verified failure revokes a required stage.

## Minimum A graduation

COS is an A-range graduated generalist only when all of these are simultaneously true:

1. all thirteen canonical University subjects have current evidence-backed grade **A or A+**;
2. English, Spanish, Portuguese, Polish, and Russian each independently have current grade **A or A+**;
3. no language is averaged with another language and no strong language dimension hides a weak one;
4. the subject/language A grades therefore already include their required fresh unseen examination, cross-domain transfer, and verified Production-transfer evidence under the existing transcript rules;
5. the global multidisciplinary **Generalist Graduation Capstone** has at least two materially distinct host-controlled passes after its latest failure.

The current transcript remains deliberately conservative: A requires verified Production transfer. The Graduation Gate does not weaken existing subject or language grading to invent an exception.

## A+ generalist standing

A+ is stronger than minimum graduation. It requires:

- every canonical subject at A+;
- every platform language at A+;
- the same current generalist-capstone requirement.

Thus an A graduate is eligible for harder learning while still pursuing A+ continuing education.

## Generalist graduation capstone

Per-subject capstones and integrated language capstones remain valuable A+ evidence, but they are not substituted for the University-wide graduation capstone required by `SKILLS.md`.

The generalist capstone becomes eligible only after all thirteen subjects and all five languages already meet the A minimum. Each capstone is:

- server-seeded and regenerated from the stored seed;
- fresh, cache-disabled, local-model-only, and tied to the exact durable COS turn;
- independently host-scored;
- multidisciplinary, sampling eight University domains per variant with Reasoning & Decision Science always present;
- bounded to supplied scenario facts so current-world retrieval cannot leak into the hidden exam;
- required to preserve uncertainty, integrate cross-domain interactions/trade-offs, produce an executable decision, and define verification before irreversible action.

Two distinct successful variants after the latest capstone failure are required. Duplicate variants count once. A later failed capstone resets the capstone stage.

## Derived and revocable status

The graduation evaluator reads current fresh University assessment rows through `academicStateFromRows(...)` and the service-only generalist-capstone evidence ledger.

It does **not** persist fields such as `graduated=true`, a letter grade, or a permanent diploma. The current result is recomputed:

```text
fresh subject transcript
+ fresh five-language transcript
+ current generalist capstone evidence
→ current graduation standing
```

If a required subject becomes stale, a language weakens, Production evidence expires, or a later capstone fails, current graduation is automatically false until the requirement is re-earned.

## Meaning of graduation

Graduation means:

```text
advanced_learning_eligible = true
continuing_education_required = true
authority_expanded = false
```

It qualifies COS for harder learning and the later Master's specialist-program architecture. It does not mean learning stops and it does not widen repository, deployment, financial, legal, data-access, publishing, safety-critical, or other execution authority.

## Storage and security

`public.cos_university_generalist_capstone_runs` stores only host-owned operational evidence needed to audit capstone attempts: seed/manifest hash, variant hash, provenance flags, verdict, turn ID, timing, and reasons.

It has RLS enabled and no `anon` or `authenticated` table privileges. It intentionally stores no raw prompt, hidden rubric, raw reply, letter grade, or graduation flag.

## Cadence

- 07:00 UTC — independent unseen examiner;
- 07:10 UTC — subject A-range;
- 07:20 UTC — five-language A-range;
- 07:30 UTC — derived Generalist Graduation Gate / eligible global capstone.

The cadence is orchestration, not biological rest. Continuous University learning and deliberate practice remain independent lanes.

## Relationship to the roadmap

This gate closes the undergraduate **proof architecture**. It does not claim COS has graduated at deployment. Production launch may correctly show `not_graduated` until the required real evidence is earned.

Only after current evidence satisfies this gate should the roadmap treat COS as qualified to enter Master's-level specialist education. Graduation remains the start of harder learning, not the end of learning.
