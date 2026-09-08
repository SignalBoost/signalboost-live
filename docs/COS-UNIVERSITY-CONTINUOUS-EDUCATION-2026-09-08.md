# COS University — Continuous Machine Education

Date: 2026-09-08

## Principle

COS and other AI agents do not need biological rest. SignalBoost therefore does not model education as a human timetable such as "study for thirty minutes, take a break, then take an exam."

The useful parts of human academic learning remain: curriculum, prerequisites, teachers/peers, libraries, laboratories, deliberate practice, independent exams, transfer, Production experience, grades, degrees, recertification, and research. Human biological limits do not.

Canonical machine model:

```text
continuous bounded learning lanes
        +
verified work/failure feedback
        +
independent examination lanes
        +
capacity scaling when needed
        ↓
continuous capability improvement toward A+
```

An execution cadence is an engineering orchestration mechanism, not rest.

## Runtime cadence

A dedicated `/api/cron/cos-university-learning` lane runs every 15 minutes. Each invocation is bounded and service-controlled.

It:

1. reads the current independent University transcript and unresolved failure autopsies;
2. plans up to twelve candidate study objectives so recently attempted high-priority work cannot starve the rest of the curriculum;
3. selects at most four study plans whose cooldown has elapsed;
4. preserves the Learning Strategist's source-class restrictions;
5. acquires governed material through the existing continuous-learning store/adapters;
6. records the study attempt without changing any grade;
7. leaves independent examination to the separate examiner lanes.

A plan has a one-hour reread cooldown. The cooldown prevents wasteful rereading of the same objective; it is not rest. Other subjects, languages, failures, indexing, research, work, and examination can continue in parallel.

## Parallelism and examination independence

Continuous learning may run while another isolated process evaluates COS. Separation means the learner cannot access the examiner's hidden seed/rubric and cannot score itself; it does not require the learning system to become idle.

Current lanes include:

- continuous University study sweep: every 15 minutes;
- broad mining/learning cycle: daily plus other existing continuous-learning pipelines;
- independent unseen University examination: host-controlled scheduled lane;
- A-range transfer/Production/capstone evaluation: separate host-controlled lane;
- learning indexer/directed-study/current-world pipelines at their own cadences.

No academic grade is produced by the continuous-learning route.

## Durable concurrency control

`public.cos_university_continuous_runs` records one unique 15-minute slot. The slot claim prevents duplicate concurrent executions of the same sweep. The route has a five-minute execution ceiling, shorter than the slot, so normal successive slots do not overlap.

The table is service-only with RLS enabled and no anonymous/authenticated privileges. It stores operational counts and plan IDs only; it has no exam prompt, rubric, answer/reply, or grade field.

## Capacity principle

Learning should not stop because current memory or storage becomes full. Capacity limits are engineering constraints to expand, tier, compress, index, archive, or otherwise manage. They are not educational graduation conditions.

Quality remains controlling: continuous learning does not mean indiscriminate ingestion. Source quality, provenance, relevance, recency, deduplication, contradiction handling, retention, and independent validation remain required.

## Relationship to SKILLS.md

This document is a normative implementation supplement to `SKILLS.md`'s self-directed education and continuing-education model.

Canonical summary:

> Machines do not graduate to stop learning, and they do not pause education for biological rest. SignalBoost uses frequent bounded learning sweeps and parallel independent examination so education remains continuous while evidence integrity stays isolated.
