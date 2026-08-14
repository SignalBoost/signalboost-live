# COS Skill Composition & Transfer Handoff — 2026-08-13

## Purpose

This increment advances the Optimus-style COS learning roadmap from individual reusable skills to hierarchical transfer:

```text
validated skills
→ real unresolved learning gap
→ distributed relevance across multiple skills
→ bounded composition candidate
→ local practice
→ independent transfer cases
→ same-case single-member baselines
→ measurable composition advantage
→ validated composite procedure
→ promotion back into procedural memory
→ future compositions may reuse the validated composite
```

The goal is not to make the model say "I combined skills." The goal is to prove that combining procedures creates capability that no single stored member demonstrated on its own.

## Canonical files

- `saas/lib/ai/cos/cognitiveCompositionPolicy.ts`
- `saas/lib/ai/cos/cognitiveCompositionCandidate.ts`
- `saas/lib/ai/cos/cognitiveSkillComposition.ts`
- `saas/supabase/migrations/20260813_cos_cognitive_skill_composition.sql`
- `saas/tests/cosCognitiveComposition.node.test.ts`
- `saas/app/api/cron/cos-mining/route.ts`

## Composition opportunity rule

The engine fails closed unless there are at least two strong procedural skills (`validated|learned|mastered`). It then examines real unresolved `cos_learning_gaps` rather than inventing a benchmark solely to create a composition.

Normal cognitive-skill semantic retrieval first chooses relevant skills. Composition is eligible only when relevance is distributed across at least two members; a weak second skill or a single overwhelmingly dominant skill does not count as a composition opportunity.

Current production reality at implementation time: there is only one strong cognitive skill (`diagnose-tenant-specific-tail-latency`). Therefore production should create **zero composition candidates/trials today**. That is correct evidence behavior, not missing functionality.

## Candidate semantics

A local/private COS reasoner may propose a bounded composition candidate using two to four strong skills. A valid plan must include:

- exact member skill keys;
- ordered handoffs;
- purpose of each member;
- inputs and outputs passed between members;
- preconditions;
- stop conditions;
- integration rules;
- observables;
- falsifiers;
- prohibited actions.

Every declared member must actually be used. Unknown or weak skills are rejected. The composition is procedural guidance only and never becomes factual corroboration or a confidence bonus.

## Practice versus transfer

Local COS may generate practice cases. Those are training only.

Database constraints prohibit:

```text
exercise_kind = transfer
AND generation_source = local_generator
```

Independent transfer cases may come from an explicitly enabled frontier evaluator, curated source, or production replay.

External evaluation remains optional/provider-neutral. It uses the existing `CosAiPort` seam and `COS_COGNITIVE_EVALUATOR_PROVIDER`; composition-specific opt-in `COS_COGNITIVE_COMPOSITION_EXTERNAL_EVALUATION_ENABLED` may override the general cognitive external-evaluation flag.

## Strongest-single-member baseline

Each independent transfer case is solved twice conceptually:

1. by the full composite plan;
2. by every member skill individually on the exact same case/rubric.

The best individual result becomes the baseline. A reusable composition must show measurable value over that strongest member, not merely pass.

Default validated-composition evidence policy:

- independent evaluator approved;
- at least 2 local practice attempts with >= 70% practice success;
- at least 3 independent transfer attempts;
- at least 3 distinct transfer variants;
- >= 80% transfer success;
- >= 0.08 mean score advantage over the strongest single member;
- composite wins at least 2/3 of transfer cases.

`learned` requires broader/fresher evidence: at least 5 transfer attempts, 4 variants, >= 85% success, >= 0.10 mean advantage, >= 70% win rate, and fresh validation.

These are capability-evidence thresholds, not answer-confidence thresholds.

## Hierarchical promotion

When a composition becomes `validated` or `learned`, it is promoted into `cos_cognitive_skills` using its deterministic `compose-*` key and composition plan.

That makes the composite itself a reusable procedural skill. Future composition cycles can therefore build higher-level skills from earlier validated composites instead of remaining a flat library of one-step behaviors.

Promotion requires every member to still be strong at promotion time. Provenance records the direct members and flattened leaf dependencies so future retrieval/dependency hardening can invalidate a composite when a required underlying skill weakens or is quarantined.

## Durable schema

New tables:

- `cos_cognitive_skill_compositions`
- `cos_cognitive_composition_trials`
- `cos_cognitive_composition_promotions`

New RPC:

- `cos_record_cognitive_composition_trial_result(...)`

The RPC records composite score, strongest-member baseline, all baseline scores, transfer/practice counters, win count, and evidence atomically.

## Scheduler / cost control

No new Vercel cron is added. `runCognitiveCompositionCycle()` is batched into the existing daily `/api/cron/cos-mining` job after individual active learning and before retention consolidation.

Defaults:

- create/advance at most one composition opportunity per cycle;
- execute at most one composition trial per cycle;
- no composition model call at all while fewer than two strong skills exist.

Transfer trials may require one composite local inference plus one local inference per member, so they are deliberately bounded.

## Non-negotiable evidence boundaries

- Multiple individually validated skills do not automatically create a validated composition.
- Local-generated practice cannot count as transfer evidence.
- A transfer case must compare the composite with every individual member on the same rubric.
- Passing is insufficient if the strongest individual member performs equally well.
- Composition status never raises factual-grounding confidence by itself.
- Frontier evaluator approval is not enough; empirical transfer evidence is still required.
- A validated composition may become a reusable skill only while all direct members remain strong at promotion time.
- Do not fabricate extra production skills or transfer cases to make the subsystem appear active.

## Next recommended cognitive slice

After this layer is production-verified with at least two real strong skills, extend **metacognition and dependency-aware skill selection**:

1. durable capability map by problem class;
2. explicit strong/weak/untested capability regions;
3. dependency invalidation for promoted composite skills during live retrieval;
4. selection based on historical transfer success, not semantic similarity alone;
5. Council/specialist escalation when multiple plausible skill paths conflict;
6. measure external-teacher calls before/after skill and composition reuse.

That is the next step toward a digital worker that knows not only *what it has learned*, but *which combination of abilities is likely to work on a new task and when it should admit that it does not know*.
