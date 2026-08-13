# COS Active Learning Handoff — 2026-08-13

## Status at takeover

This subsystem is no longer only a design/branch experiment.

- PR #1160 is merged to `main` as `85e53a2e6699837147ab816bdda1f2f540b6a62e`.
- The merge-triggered production deployment observed during handoff was `dpl_CSfDedRPuYas6SjbsdnqyGP4TC2Y` and reached `READY`.
- Migration `saas/supabase/migrations/20260813_cos_active_learning_queue.sql` is applied in production Supabase project `qpblefwtnbivuusxmabv`.
- The first manually trained procedural skill, `diagnose-tenant-specific-tail-latency`, is `validated` in production and has been proven through the normal COS answer path.
- Current live local reasoner remains `qwen2.5-coder:32b`. `qwen3:30b` is the intended durable bootstrap/default in code but is **not yet installed/served on the existing running pod**.

Read `docs/HANDOFF-2026-08-13.md` for the complete platform takeover context.

## North star

COS is not trying to become a clone of one chat model. The product objective remains a continuously learning cognitive system that accumulates verified experience, procedural skills, tool competence and institutional memory, and can keep that intelligence when the underlying model changes.

Canonical cycle:

```text
experience
→ reflection
→ candidate skill
→ evaluation
→ understanding
→ practice
→ independent holdout
→ validated
→ learned
→ mastered
```

A teacher answer, retrieved document, generated exercise, or one successful retry is not learned knowledge.

The mature target remains roughly **85% independent pass rate on the defined SignalBoost workload**, measured on held-out work. This is a capability target, not a confidence target. Never weaken the 0.72 answer gate to improve the independence metric.

## Memory/evidence separation

COS must preserve distinct memory/evidence classes:

- **episodic experiences** — attempts, failures, corrections, teacher disagreements and outcomes;
- **semantic/factual memory** — verified generalized facts/concepts;
- **procedural skills** — reusable methods with observables/falsifiers/failure modes;
- **teacher signals** — external escalation outcomes, not trusted truth;
- **answer cache** — reusable prior answers under a specific answer-policy version.

Procedural `[SK#]` citations are not factual `[KG#]/[CL#]/[EM#]` evidence and cannot increase the factual evidence ceiling merely because a skill is validated.

## Teacher reflection

`saas/lib/ai/cos/cognitiveActiveLearning.ts` reads captured/evaluated teacher lessons. COS's local reasoner compares the original problem, its prior attempt, the escalation reason and the teacher signal, then extracts a generalized procedural candidate.

The teacher response is explicitly treated as evidence to inspect, not factual authority.

`saas/lib/ai/cos/cognitiveSkillCandidate.ts` requires a candidate to include:

- problem class;
- generalized procedure steps;
- discriminating signals;
- concrete observables;
- falsifiers;
- failure modes;
- prohibited actions.

Memorization-shaped/non-falsifiable candidates are rejected.

## Practice versus holdout

Local COS may generate practice variants. Those exercises are permanently classified as local-generated practice and can never count as independent holdout evidence.

Independent holdouts may come only from an allowed independent source such as:

- external teacher/evaluator;
- curated source;
- production replay.

The database enforces this boundary with a CHECK constraint rather than relying only on application convention.

This is non-negotiable: a system cannot grade itself on examples it generated and call that independent validation.

## Independent evaluator

External evaluation is optional and disabled unless:

`COS_COGNITIVE_EXTERNAL_EVALUATION_ENABLED=true`

When enabled, the configured SignalBoost-host teacher adapter may review the candidate skeptically and create separate understanding/holdout cases. Provider execution remains behind `CosAiPort`; cognitive code must not import a raw provider router.

External models remain replaceable teachers. Their output is not inserted directly into factual KG/corpus knowledge.

## Durable queue and promotion evidence

Migration `20260813_cos_active_learning_queue.sql` adds:

- `cos_active_practice_queue` — durable practice/holdout work;
- `cos_learning_promotions` — auditable lifecycle transition evidence;
- `cos_record_cognitive_practice_result(...)` — service-role atomic result recording into episodic memory plus skill counters.

Current production snapshot during this handoff:

| Object | Count |
|---|---:|
| `cos_teacher_lessons` | 1 |
| `cos_cognitive_experiences` | 1 |
| `cos_cognitive_skills` | 1 |
| `cos_active_practice_queue` | 0 |
| `cos_learning_promotions` | 0 |

Zero queue/promotion rows are a dated snapshot, not evidence that the worker is broken. It means no pending generated work/promotion rows existed at the instant queried. Verify the next real cycle before judging runtime behavior.

## Promotion

After each recorded exercise, lifecycle status is recomputed by the deterministic `evaluateCognitiveSkillEligibility` policy.

Active learning does **not** modify the answer-confidence formula.

Only:

- `validated`;
- `learned`;
- `mastered`

skills are eligible for live COS retrieval.

Evidence semantics:

- `encountered`: COS has seen the pattern;
- `evaluated`: candidate survived independent review;
- `understood`: COS demonstrated the principle on a separate case;
- `practiced`: training variants succeeded;
- `validated`: required unseen holdout evidence passed;
- `learned`: broader/fresher holdout evidence passed;
- `mastered`: stronger holdout evidence plus independent production outcomes passed.

Lifecycle status is capability evidence, not a confidence bonus.

## Cost control

`runCognitiveLearningCycle()` is bounded and called from the existing daily `cos-mining` cron rather than adding another Vercel schedule.

Default cycle size is one lesson plus two practice items. External evaluation is opt-in, so local reflection/practice is the inexpensive default.

The goal is to reduce future paid teacher calls by learning from the calls COS genuinely needed, not to call teachers continuously.

## First validated skill — production proof

Skill:

`diagnose-tenant-specific-tail-latency`

Current production record:

- evaluator approved: true;
- understanding approved: true;
- practice attempts/successes: 2/2;
- holdout attempts/successes: 3/3;
- distinct holdout variants: 3;
- failure count: 0;
- status: `validated`;
- last validated: `2026-08-13 05:43:18.861+00`.

The third holdout was deliberately constructed so the evidence pointed to an enterprise-only SAML/audit middleware path rather than the stored query-plan/pool/cache template. Qwen correctly re-ranked that path to #1. Treat this as evidence of generalization, not mastery of the whole domain.

## Live skill retrieval/provenance proof

PR #1156 restricted live skill retrieval to `validated/learned/mastered` skills.

PR #1158 then made procedural skill use citation-safe. If a validated skill was injected but Qwen omitted the `[SK#]` marker, COS may perform one citation-only repair pass. The repair is accepted only when:

1. every inserted tag is from the supplied allowed skill labels; and
2. removing the inserted skill tags leaves the original answer substance unchanged.

A production benchmark was run through normal `tryCOSFirstAnswer` after forcing an answer-policy version change so an older cached answer could not bypass the new provenance contract.

Observed fresh result:

- response source: `local_cos_reasoning`;
- local model invoked: true;
- reasoner: `independent-local:qwen2.5-coder:32b`;
- confidence: 0.78;
- threshold: 0.72;
- external AI invoked: false;
- cognitive skill funnel: `1 retrieved → 1 relevant → 1 selected → 1 injected → 1 cited`;
- authoritative `cognitive_skills.used = true`;
- Knowledge Graph/learned corpus were not falsely credited;
- `[SK1]` appeared inline only as procedural provenance.

Vercel runtime telemetry also recorded:

`[cos-skill-citation-repair] attempted:true, accepted:true, allowedTags:["[SK1]"], citedTags:["[SK1]"]`

The temporary verifier route was deleted immediately after proof and production was explicitly checked to return HTTP 404 for that route.

## Cache-policy lesson

The first fresh-verifier attempt unexpectedly returned the pre-PR-1158 cached benchmark answer. This revealed a real policy-coherency bug: changing skill citation/accounting semantics without changing the answer-policy fingerprint allowed an old answer to bypass the new rule.

`COS_ANSWER_GATE_REVISION` in `saas/lib/ai/cos/cosAnswerPolicy.ts` was bumped. Older rows remain in storage but are unreachable under the new policy version.

Rule for future agents: if the acceptance/evidence/citation rules change in a way that the existing hashed prompt/model/threshold inputs cannot see, bump the manual gate revision.

## Reuse accounting gap

`recordCitedCognitiveSkillReuse(skillIds)` exists in `saas/lib/ai/cos/cognitiveSkillContext.ts` and updates `reuse_count`/`last_used_at`.

At this handoff the validated skill still has:

- `reuse_count = 0`;
- `last_used_at = NULL`.

The production proof intentionally established truthful provenance first. The next agent should wire reuse accounting only after **actual cited skill use**. Do not increment on retrieval, relevance, selection or injection.

## Current factual-learning state related to active learning

Production snapshot during the same handoff:

- `cos_continuous_learning = 1`;
- current retained source kind: `official_documentation`;
- average current summary length: 1089 chars;
- average confidence: 0.83;
- `cos_knowledge_facts = 5`;
- embedded facts: 5/5.

This follows the earlier cleanup that removed 261/262 low-substance/inflated-confidence learned rows. Active learning must not reintroduce the old failure mode by converting teacher prose or metadata blurbs directly into trusted facts.

## Qwen3 limitation

`qwen3:30b` is the intended durable local bootstrap/default in current code, but the existing running RunPod pod still serves `qwen2.5-coder:32b`.

The ~19 GB Qwen3 pull could not be completed through the current HTTPS/Ollama gateway because the intermediate path buffers upstream responses and times out on long pulls. Ollama streaming does not solve this when the gateway buffers. RunPod's public management API does not expose arbitrary remote shell execution.

The remaining model cutover therefore requires RunPod Web Terminal/SSH or another legitimate pod shell mechanism. After installing, verify the model list, authenticated inference, production `LOCAL_AI_MODEL`, health/provenance and held-out benchmark quality before calling Qwen3 live or better.

Never expose `/workspace/cos-api-key`.

## Next increments

1. **Wire cited reuse accounting** — increment only after actual `[SK#]` citation/use.
2. **Run/observe the first real post-#1160 active-learning cycle** and verify teacher lesson → candidate → queue → result → lifecycle/promotion evidence.
3. **Retention scheduler** — delayed re-tests so validation can decay/reconfirm over time.
4. **Consolidation/reconsolidation worker** — cluster related experiences and repeated lessons.
5. **Metacognitive capability map** — strong / weak / untested / repeatedly failed classes.
6. **Production outcome feedback** — mastery must reflect real-world results, not only synthetic/held-out exercises.
7. **Automatic weakening/quarantine** — contradictory/bad outcomes should reduce or disable a skill.
8. **Teacher-dependency metrics by problem class** — verify external escalations fall after learning.
9. **Skill composition** — combine several validated procedures on a novel task.
10. **Specialist/COS Council protocol** — independent first opinions, then evidence-weighted synthesis; no naive majority vote.
11. **Held-out workload certification** — broad hidden suite for the ~85% independent-pass target.
12. **Model-swap validation** — when Qwen3 or another buyer model is introduced, prove COS memory/skills remain useful without retraining from scratch.

## Guardrails

- Never promote because a frontier provider said something.
- Never let locally generated exercises masquerade as holdouts.
- Never increase answer confidence merely because a skill has a high lifecycle status.
- Never bypass approvals or execution governance because a skill is mastered.
- Never call a validated procedural skill factual evidence.
- Never call `encountered/evaluated/understood/practiced` "learned".
- Preserve BYOM/BYOA: current development reasoner/teacher providers are replaceable host adapters, not COS identity.
- Preserve exact provenance: retrieved → relevant → selected → injected → cited.
- Re-scan current `main` before changes because multiple agents work concurrently.

## Primary implementation files

- `saas/lib/ai/cos/cognitiveActiveLearning.ts`
- `saas/lib/ai/cos/cognitiveSkillCandidate.ts`
- `saas/lib/ai/cos/cognitiveLearningLifecycle.ts`
- `saas/lib/ai/cos/cognitiveSkillContext.ts`
- `saas/lib/ai/cos/teacherLearning.ts`
- `saas/lib/ai/cos/cosFirstAnswer.ts`
- `saas/lib/ai/cos/cosAnswerPolicy.ts`
- `saas/lib/ai/cos/cosOrchestration.ts`
- `saas/lib/cos/aiPort.ts`
- `saas/app/api/cron/cos-mining/route.ts`
- `saas/supabase/migrations/20260813_cos_cognitive_learning_lifecycle.sql`
- `saas/supabase/migrations/20260813_cos_active_learning_queue.sql`
- `saas/tests/cosCognitiveActiveLearning.node.test.ts`
- `saas/tests/cosCognitiveLearningLifecycle.node.test.ts`

## North-star handoff sentence

The valuable asset is a **COS cognitive system that accumulates validated experience, procedural skills, factual memory, corrections and tool competence; proves when that knowledge actually affected an answer/action; and can transfer the accumulated capability across replaceable underlying models and providers.**
