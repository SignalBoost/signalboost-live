# COS Metacognition & Dependency-Aware Selection Handoff — 2026-08-13

## Purpose

This increment advances COS from possessing validated procedures to reasoning explicitly about the health of those capabilities before selecting them.

```text
validated skills / composites
→ dependency health
→ semantic relevance
→ verified production + retention history
→ evidence-aware skill selection
→ capability map (strong / developing / weak / untested / conflicted)
→ daily recomputation from current evidence
```

This is metacognition about capability. It is **not answer confidence** and does not add factual evidence.

## Canonical files

- `saas/lib/ai/cos/cognitiveMetacognition.ts`
- `saas/lib/ai/cos/cognitiveSkillContext.ts`
- `saas/supabase/migrations/20260814_cos_metacognitive_capabilities.sql`
- `saas/tests/cosCognitiveMetacognition.node.test.ts`
- `saas/app/api/cron/cos-mining/route.ts`

## Dependency-aware retrieval

Validated composite skills carry flattened `leaf_member_skill_keys` provenance. Live retrieval now verifies every such dependency is still `validated|learned|mastered`.

If any required leaf has weakened, been quarantined, or otherwise ceased being strong, the composite fails closed and is not injected into a live answer. Historical success counters cannot override broken dependencies.

## Evidence-aware skill selection

Semantic relevance remains the primary gate. Among semantically relevant, dependency-healthy skills, selection also considers:

- lifecycle strength (`validated`, `learned`, `mastered`);
- verified production success history;
- delayed-retention history;
- accumulated failure history.

This evidence is used only to choose among already-valid procedural candidates. It does not become factual corroboration and does not raise COS answer confidence.

## Capability map

New table: `cos_metacognitive_capabilities`.

Each problem class is summarized as one of:

- `strong` — validated procedural capability without current contradictory/weakening evidence;
- `developing` — useful capability exists but unresolved gaps or weak outcome history remain;
- `weak` — observed gaps lack validated capability, or prior procedures have weakened/quarantined;
- `untested` — no validated capability and no observed unresolved gap;
- `conflicted` — strong and quarantined procedures coexist in the same region.

`reliability` in this table is capability/selection evidence only. It must never be copied into response confidence.

The map is rebuilt deterministically in the existing daily COS mining cycle after active learning, composition and consolidation. No additional cron or model call is added.

## Evidence boundaries

- Similar wording cannot revive a composite with an unhealthy dependency.
- A mastered status does not override dependency failure.
- Historical success can break close semantic ties but cannot bypass the semantic relevance floor.
- Metacognitive `reliability` is not response confidence.
- Capability regions do not count as factual grounding.
- The map reports the evidence COS actually has; missing evidence should remain weak/untested rather than be filled synthetically.

## Current production expectation

At implementation time production still had only one strong individual cognitive skill. Therefore this feature should not invent additional skills or compositions. Its immediate value is to harden future hierarchical skill retrieval and establish a truthful capability map as real skills/gaps accumulate.

## Next recommended cognitive slice

Build the first **Council / specialist deliberation layer** around metacognitive uncertainty and disagreement:

1. trigger only for novel, conflicted, sparse-evidence, repeatedly failed, or high-consequence cases;
2. collect independent first opinions before agents see one another;
3. exchange structured claims/evidence/assumptions/falsifiers rather than hidden chain-of-thought;
4. weight specialists by domain-specific verified history, not majority vote;
5. allow deterministic/tool verification to overrule all model opinions;
6. feed resolved disagreements back into teacher lessons, skills, and capability-map evidence.

That gives COS a controlled mechanism for asking multiple minds when its own metacognitive state says a single path is not trustworthy enough.
