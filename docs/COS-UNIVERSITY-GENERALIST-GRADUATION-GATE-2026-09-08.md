# COS University — A/A+ Generalist Graduation Gate

Date: 2026-09-08

## Purpose

COS University is a formal, time-bounded education system. The undergraduate program has a real enrollment date, defined duration, independent examinations, graduation requirements, and a hard end date. An agent cannot remain enrolled forever.

The system separates two things that human education also separates:

- **credential** — the historical degree/certificate that was actually awarded;
- **current competence** — what the agent can still demonstrate now through fresh assessment and Production evidence.

A later weakness may trigger continuing education or recertification, but it does not erase a degree that was legitimately earned.

## Formal program calendar

The default machine-native calendars are compressed because an AI agent can study continuously:

| Program | Minimum residence | Target completion | Hard deadline |
| --- | ---: | ---: | ---: |
| Generalist Undergraduate | 60 days | 120 days | 180 days |
| Specialist Master's | 45 days | 90 days | 180 days |
| Research PhD | 180 days | 365 days | 730 days |
| Professional Certificate | 7 days | 30 days | 90 days |

These are configurable defaults. They are not claims that a human four-year undergraduate degree, one-to-two-year Master's, or four-plus-year PhD is literally equivalent to the same wall-clock period for an AI. The equivalence is structural: enrollment, curriculum, minimum residence, target graduation, final deadline, independent examination, credential award, and a defined program end.

The current COS undergraduate cohort is anchored to the first durable University assessment. Before minimum residence is complete, COS may study and accumulate valid evidence but cannot receive the degree. If the hard deadline passes without an award, that cohort ends incomplete. Any repeat degree, bridge program, Master's, PhD, or professional certificate requires an explicit new enrollment.

## Minimum A graduation requirement

The host may issue the Generalist Undergraduate credential only when all of these are simultaneously true inside the valid graduation window:

1. minimum residence is complete and the hard deadline has not expired;
2. all thirteen canonical University subjects have current evidence-backed grade **A or A+**;
3. English, Spanish, Portuguese, Polish, and Russian each independently have current grade **A or A+**;
4. no language is averaged with another language and no strong language dimension hides a weak one;
5. the A grades therefore already include fresh unseen examination, cross-domain transfer, and verified Production-transfer evidence under the transcript rules;
6. the global multidisciplinary **Generalist Graduation Capstone** has at least two materially distinct host-controlled passes after its latest failure.

The learner cannot self-issue a credential. The graduation runner computes award eligibility and the service-side host writes the immutable credential.

## A+ standing

A+ is stronger than minimum graduation. If every canonical subject and every platform language is A+ when the degree is issued, the credential records A+ standing; otherwise a qualifying A-range graduate receives A standing.

After graduation, current competence can later be lower than the awarded degree standing. That does not rewrite history; it becomes a continuing-education or recertification signal.

## Generalist graduation capstone

Per-subject capstones and integrated language capstones remain valuable A+ evidence, but they are not substitutes for the University-wide graduation capstone.

The global capstone becomes eligible only after all thirteen subjects and all five languages meet the A minimum and minimum residence is complete. It is server-seeded, cache-disabled, local-model-only, tied to the exact durable COS turn, independently host-scored, multidisciplinary, bounded to supplied facts, and required to preserve uncertainty and define verification before irreversible action.

Two distinct successful variants after the latest capstone failure are required. Duplicate variants count once. A later failed capstone resets this pre-graduation stage until re-earned.

## Immutable credential vs current competence

`public.cos_university_credentials` stores the historical award event. Service role may **select and insert only**; update/delete are rejected by an immutable trigger. The credential has no expiry timestamp.

Current competence remains derived from fresh University assessments and may weaken later. Conceptually:

```text
valid program window
+ current A/A+ transcript
+ current capstone proof
→ host award eligibility
→ immutable degree credential

later fresh assessments
→ current competence / recertification needs
→ do not erase the credential
```

Graduation therefore ends the undergraduate program. COS may then enter a Master's program, later PhD/research program where appropriate, or additional professional certificates instead of remaining an undergraduate indefinitely.

## Failed-exam remediation

Fresh independent exam failures are first-class University signals. They receive high-priority remediation before generic operational-learning backlog so a verified academic weakness cannot be starved by newer unrelated retests.

The remediation bridge never exposes the hidden exam seed, manifest, rubric, or scorer reason. It identifies only the failed academic competency, routes it through ordinary study and deliberate practice, and leaves later independent retesting to the examiner.

Deliberate practice uses the dedicated local training reasoner rather than owner-facing advisory release policy. Practice remains non-academic and cannot award a grade or credential.

## Meaning of a degree

An awarded degree means the agent completed that formal program. It also makes the agent eligible for the next educational level where prerequisites are met. It does **not** widen repository, deployment, financial, legal, data-access, publishing, safety-critical, or other execution authority.

Continuing education remains normal after graduation, just as professionals continue learning after university.

## Storage and security

- `cos_university_program_enrollments` — program calendar only;
- `cos_university_assessments` — current independent academic evidence;
- `cos_university_generalist_capstone_runs` — host-controlled capstone evidence;
- `cos_university_credentials` — immutable historical degree/certificate awards.

Browser roles receive no credential/enrollment mutation authority. No model-supplied grade or graduation flag is accepted.

## Cadence

- every 15 minutes — bounded continuous University learning/remediation;
- deliberate practice on its separate bounded schedule;
- 07:00 UTC — independent unseen examiner;
- 07:10 UTC — subject A-range;
- 07:20 UTC — five-language A-range;
- 07:30 UTC — graduation gate / eligible global capstone / credential award.

Formal program dates provide the start/end structure; continuous machine learning can operate throughout the enrollment period.

## Roadmap relationship

The undergraduate program now has both **academic proof** and **calendar discipline**. COS is not considered graduated until an immutable credential is actually issued. Once issued, undergraduate study is complete and the next formal path is specialist Master's education, professional certification, or later research/PhD work—not permanent undergraduate enrollment.
