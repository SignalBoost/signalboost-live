# COS Active Learning Handoff — 2026-08-13

## North star

COS is not trying to become a clone of one chat model. The product objective remains a continuously learning cognitive system that accumulates verified experience, procedural skills, tool competence and institutional memory, and can keep that intelligence when the underlying model changes.

Canonical cycle:

`experience → reflection → candidate skill → evaluation → understanding → practice → independent holdout → validated → learned → mastered`

A teacher answer, retrieved document, generated exercise, or one successful retry is not learned knowledge.

## This increment

This branch operationalizes the first durable active-practice loop on top of `cos_teacher_lessons`, `cos_cognitive_experiences` and `cos_cognitive_skills`.

### Teacher reflection

`saas/lib/ai/cos/cognitiveActiveLearning.ts` reads captured/evaluated teacher lessons. COS's local reasoner compares the original problem, its prior attempt, the escalation reason and the teacher signal, then extracts a generalized procedural candidate. The teacher response is explicitly treated as evidence to inspect, not factual authority.

The candidate contract in `cognitiveSkillCandidate.ts` requires a problem class, procedure steps, discriminating signals, observables, falsifiers, failure modes and prohibited actions. Memorization-shaped candidates are rejected.

### Practice versus holdout

Local COS may generate practice variants. Those exercises are permanently labeled `local_generator` and can never count as holdout evidence.

Independent holdouts may come only from an external teacher/evaluator, a curated source or a production replay. The database enforces this with a CHECK constraint, not merely application convention.

### Independent evaluator

External evaluation is optional and disabled unless `COS_COGNITIVE_EXTERNAL_EVALUATION_ENABLED=true`.

When enabled, the configured SignalBoost-host teacher adapter reviews the candidate skeptically, creates a separate understanding case and three unseen holdouts. Provider execution remains behind `CosAiPort`; cognitive code does not import the raw provider router.

External models remain replaceable teachers. Their output is not inserted directly into factual KG/corpus knowledge.

### Durable queue and evidence

Migration `20260813_cos_active_learning_queue.sql` adds:

- `cos_active_practice_queue` — durable practice/holdout work;
- `cos_learning_promotions` — auditable lifecycle transition evidence;
- `cos_record_cognitive_practice_result(...)` — service-role atomic result recording into episodic memory plus skill counters.

The migration was applied successfully to production Supabase project `qpblefwtnbivuusxmabv` on 2026-08-13.

### Promotion

After each recorded exercise, lifecycle status is recomputed by the existing deterministic `evaluateCognitiveSkillEligibility` policy. Active learning does not modify the answer-confidence formula. Only `validated`, `learned` or `mastered` skills remain eligible for live retrieval.

### Cost control

`runCognitiveLearningCycle()` is bounded and is called from the existing daily `cos-mining` cron rather than adding another Vercel schedule. Default cycle size is one lesson plus two practice items. External evaluation is opt-in, so local reflection/practice is the inexpensive default.

## Evidence boundary

The intended semantics are:

- `encountered`: COS has seen the pattern;
- `evaluated`: candidate survived independent review;
- `understood`: COS demonstrates the principle on a separate case;
- `practiced`: training variants succeeded;
- `validated`: required unseen holdout evidence passed;
- `learned`: broader/fresher holdout evidence passed;
- `mastered`: stronger holdout evidence plus independent production outcomes passed.

Lifecycle status is capability evidence, not a confidence bonus.

## Current known live skill

`diagnose-tenant-specific-tail-latency` is currently validated from the preceding manual training increment. It is useful as a proof that validated procedural skills can be retrieved by COS, but the durable learning loop must generalize beyond that benchmark.

## Next increments

1. retention scheduler and delayed re-tests;
2. consolidation/reconsolidation worker for related experiences and repeated lessons;
3. metacognitive capability map: strong / weak / untested / repeatedly failed classes;
4. production outcome feedback so mastery reflects real-world results;
5. automatic weakening/quarantine on contradictory or bad outcomes;
6. teacher-dependency metrics by problem class;
7. skill composition: combine several validated procedures on a novel task;
8. specialist/COS Council protocol with independent first opinions and evidence-weighted synthesis;
9. held-out workload certification for the 85% independent-pass target.

## Guardrails

- Never promote because a frontier provider said something.
- Never let locally generated exercises masquerade as holdouts.
- Never increase answer confidence merely because a skill has a high lifecycle status.
- Never bypass approvals or execution governance because a skill is mastered.
- Preserve BYOM/BYOA: SignalBoost's current development reasoner/teacher providers are replaceable host adapters, not COS identity.
- Re-scan current `main` before changes because multiple agents work concurrently.
