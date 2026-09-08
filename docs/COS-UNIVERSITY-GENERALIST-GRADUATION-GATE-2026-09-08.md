# COS University — A/A+ Generalist Graduation Gate

Date: 2026-09-08

## Purpose

This slice creates the University-level gate that answers one question with current evidence: **has COS earned the multidisciplinary generalist foundation required before graduate specialization?**

Graduation is not a permanent mutable flag. It is a derived current qualification that can be lost when evidence expires or a later independently verified failure revokes a required stage.

## Formal program calendar

COS University is not indefinite. Like a human university or professional school, every degree/certificate enrollment has a real start date, an earliest graduation date, a target completion date, and a hard completion deadline.

The default machine-native calendars are intentionally compressed because an AI agent can study continuously:

| Program | Minimum residence | Target completion | Hard deadline |
| --- | ---: | ---: | ---: |
| Generalist Undergraduate | 60 days | 120 days | 180 days |
| Specialist Master's | 45 days | 90 days | 180 days |
| Research PhD | 180 days | 365 days | 730 days |
| Professional Certificate | 7 days | 30 days | 90 days |

These are configurable program defaults, not claims that human four-year, one-to-two-year, or four-plus-year degrees are literally equivalent to those wall-clock durations. The equivalence is structural: bounded enrollment, curriculum, instruction/practice, independent evaluation, graduation requirements, and a defined end.

The current COS undergraduate cohort is anchored to the first durable University assessment. Before minimum residence is complete, COS may study and accumulate valid evidence but cannot graduate. If the hard deadline passes without graduation, that cohort ends incomplete; the system does not silently extend enrollment forever. Any subsequent degree, repeat enrollment, bridge program, or professional certificate must be an explicit new enrollment.

## Minimum A graduation

COS is an A-range graduated generalist only when all of these are simultaneously true:

1. the undergraduate enrollment is inside its permitted graduation window;
2. all thirteen canonical University subjects have current evidence-backed grade **A or A+**;
3. English, Spanish, Portuguese, Polish, and Russian each independently have current grade **A or A+**;
4. no language is averaged with another language and no strong language dimension hides a weak one;
5. the subject/language A grades therefore already include their required fresh unseen examination, cross-domain transfer, and verified Production-transfer evidence under the existing transcript rules;
6. the global multidisciplinary **Generalist Graduation Capstone** has at least two materially distinct host-controlled passes after its latest failure.

The current transcript remains deliberately conservative: A requires verified Production transfer. The Graduation Gate does not weaken existing subject or language grading to invent an exception.

## A+ generalist standing

A+ is stronger than minimum graduation. It requires:

- every canonical subject at A+;
- every platform language at A+;
- the same current generalist-capstone requirement;
- a valid undergraduate program window.

Thus an A graduate is eligible for harder learning while still pursuing A+ continuing education.

## Generalist graduation capstone

Per-subject capstones and integrated language capstones remain valuable A+ evidence, but they are not substituted for the University-wide graduation capstone required by `SKILLS.md`.

The generalist capstone becomes eligible only after all thirteen subjects and all five languages already meet the A minimum and the minimum residence period is complete. Each capstone is:

- server-seeded and regenerated from the stored seed;
- fresh, cache-disabled, local-model-only, and tied to the exact durable COS turn;
- independently host-scored;
- multidisciplinary, sampling eight University domains per variant with Reasoning & Decision Science always present;
- bounded to supplied scenario facts so current-world retrieval cannot leak into the hidden exam;
- required to preserve uncertainty, integrate cross-domain interactions/trade-offs, produce an executable decision, and define verification before irreversible action.

Two distinct successful variants after the latest capstone failure are required. Duplicate variants count once. A later failed capstone resets the capstone stage.

## Derived and revocable status

The graduation evaluator reads current fresh University assessment rows through `academicStateFromRows(...)`, the service-only generalist-capstone evidence ledger, and the current program enrollment window.

It does **not** persist fields such as `graduated=true`, a letter grade, or a permanent diploma. The current result is recomputed:

```text
current program window
+ fresh subject transcript
+ fresh five-language transcript
+ current generalist capstone evidence
→ current graduation standing
```

If a required subject becomes stale, a language weakens, Production evidence expires, a later capstone fails, or the cohort deadline expires before graduation, current graduation is false until an appropriate valid program path is completed.

## Failed-exam remediation

Fresh independent exam failures are first-class University signals. They receive a high-priority remediation plan before generic operational-learning backlog so a verified academic weakness cannot be starved by newer unrelated retests.

The remediation bridge deliberately does not expose the hidden exam seed, manifest, rubric, or scorer reason. It tells the learner only which subject/language competency failed, then routes the weakness through ordinary study and deliberate practice before a later independent retest.

Deliberate practice uses the dedicated local training reasoner rather than owner-facing advisory release policy. Practice remains non-academic: it cannot write a University grade.

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

`public.cos_university_program_enrollments` stores only the formal academic calendar: program identity/level and enrollment, minimum-residence, target-completion, and hard-deadline timestamps.

Both are service-only with RLS enabled and no `anon` or `authenticated` table privileges. Neither stores a caller-supplied grade or mutable graduation flag.

## Cadence

- every 15 minutes — bounded continuous University learning/remediation;
- deliberate practice on its independent bounded schedule;
- 07:00 UTC — independent unseen examiner;
- 07:10 UTC — subject A-range;
- 07:20 UTC — five-language A-range;
- 07:30 UTC — derived Generalist Graduation Gate / eligible global capstone.

The cadence is orchestration, not biological rest. Formal program dates provide the start/end structure; continuous machine learning may operate throughout the enrollment window.

## Relationship to the roadmap

This gate closes the undergraduate **proof architecture**. It does not claim COS has graduated at deployment. Production may correctly show `not_graduated` while the program is in progress.

Only after current evidence and the academic calendar satisfy this gate should the roadmap treat COS as qualified to enter Master's-level specialist education. A graduate may then enroll in a Master's program, PhD/research program where appropriate, or additional professional certificates. Graduation remains the start of harder learning, not the end of learning.
