# COS University Continuous Learning — 2026-09-07

## Purpose

This slice turns the COS University blueprint into a durable, self-driving learning control loop without allowing operational telemetry, corpus growth, or self-assessment to manufacture academic grades.

Canonical separation:

```text
real work / independent exams
        ↓
observe weakness or evidence
        ↓
academic transcript + remediation planner
        ↓
Learning Strategist chooses HOW to study
        ↓
governed acquisition / practice / labs / peers / teachers as applicable
        ↓
independent unseen retest
        ↓
only independent evidence may update academic standing
        ↓
continue toward A+
```

`ONBOARD.md` remains authoritative for runtime/security/authorization. `SKILLS.md` remains authoritative for COS education/graduation/specialization direction.

## Durable academic evidence

`public.cos_university_assessments` stores evidence, never a caller-supplied letter grade.

A transcript grade is derived from fresh assessment rows that satisfy the independent-scorer contract. Evidence expires through `valid_until`, making recertification explicit rather than trusting a learner-provided freshness flag.

The table accepts either:

- one of the 13 COS University subjects; or
- one of the five SignalBoost platform languages (`en`, `es`, `pt`, `pl`, `ru`) plus a specific language competency dimension.

Production-transfer evidence requires `verified_production`. Capstone evidence requires `host_capstone`.

Ordinary ingestion, embeddings, corpus counts, cognitive-skill lifecycle status, model confidence, study-plan completion, or owner dashboards do not directly produce a passing academic grade.

## Durable study plans

`public.cos_university_study_plans` stores the work COS has identified for itself.

Plans may originate from:

- exact-turn failure autopsies;
- operational weakness;
- continuing academic rotation;
- platform-language rotation;
- later recertification work.

The target defaults to `A+`. Plans do not grant execution authority and do not award degrees.

## Learning Strategist

The standardized lifecycle remains the same, while study method varies by diagnosis.

Examples:

| Diagnosed gap | Preferred learning methods |
| --- | --- |
| stale/current knowledge | live authoritative research → governed retention → independent retest |
| retrieval | RAG/library + live gap-filling + retrieval practice + independent retest |
| evidence selection / grounding | varied trustworthy evidence + deliberate practice + tutor/critic + independent retest |
| tool execution | sandbox/lab + safe production replay + official docs + independent unseen task |
| calibration | confidence/outcome practice + production replay + independent retest |
| reasoning | teacher/critic + peer debate where available + deliberate practice + authoritative material + independent retest |
| language | authentic material + fresh usage + tutor/peer interaction + separate practice across all five dimensions + independent language exam |
| cross-domain integration | specialist/peer perspectives + case practice + real-work replay + independent capstone |
| retention | spaced practice + authoritative review + recertification |

### A2A, professors, peers, and fine-tuning

Teacher agents and peer/A2A agents are first-class study-method concepts, but they remain `requires_bridge` until an authorized runtime bridge is actually connected. The planner records the method; it does not pretend it executed it.

Fine-tuning is `candidate_only`. It is considered only after repeated failures plus repeated independent retest failures. The planner never launches fine-tuning automatically and never assumes fine-tuning is superior to retrieval, practice, tools, or better evidence.

## Method-specific acquisition

University study signals can carry explicit allowed source classes. The continuous-learning cycle honors those constraints.

This makes method selection operational:

- fresh authoritative research can consult current/authoritative source classes;
- tool-execution study can constrain acquisition to official documentation/library material;
- ordinary pre-University learning gaps continue to use the historical all-adapter behavior when no source constraint is present.

## Continuous education when nothing is broken

Machines do not wait for a failure before learning.

When no higher-priority failure work consumes the bounded planning capacity, the planner rotates through:

1. University subjects below A+; and
2. the five required platform languages below A+.

Rotation prevents the first unassessed subject from starving the rest of the curriculum.

## Five SignalBoost languages

English, Spanish, Portuguese, Polish, and Russian remain independently measured. No strong language can compensate for a weak one.

Each language ultimately requires independent evidence across:

- comprehension;
- writing;
- instruction following;
- translation/localization;
- cultural pragmatics.

## Daily runtime integration

The daily COS mining/learning cron now performs University planning before autonomous acquisition. Automatically executable acquisition plans become governed learning-gap signals and are passed into the existing continuous-learning system.

Plans that require a future bridge (sandbox/lab, A2A peers, teacher-agent orchestration, production replay, fine-tuning experiment) remain explicitly recorded rather than silently simulated.

After the daily acquisition cycle runs, acquisition-capable University plans are marked as attempted. Attempted/studying does not mean learned, validated, or passed.

## Anti-gaming / independence

Non-negotiable:

- failure can create study work but cannot directly lower or raise a grade;
- study completion cannot directly raise a grade;
- self-scored or expired assessment evidence cannot raise a grade;
- exam/Production/capstone authority remains independent from the learner;
- a legitimate exam failure is repaired in COS, not by weakening the scorer;
- A+ remains the continuous destination, not a stopping condition;
- authorization remains separate from capability.

## Next implementation slices

This slice establishes durable transcript evidence, durable plans, adaptive method selection, source-constrained acquisition, and daily automatic planning.

Still to build progressively:

1. independent subject diagnostic/exam generation and durable write-back into `cos_university_assessments`;
2. automatic deliberate-practice bridge from University plans into the cognitive practice/certification system;
3. sandbox/lab bridge for execution-heavy competencies;
4. safe production-replay bridge;
5. teacher/professor and peer/A2A study bridges;
6. owner-facing transcript/curriculum dashboard;
7. multidisciplinary capstone engine;
8. Master's/PhD specialist academic programs;
9. controlled fine-tuning experiment pipeline only when the evidence says it is justified.
