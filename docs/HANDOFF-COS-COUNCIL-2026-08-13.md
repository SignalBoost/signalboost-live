# COS Council First Layer Handoff — 2026-08-13

## Purpose

This increment adds the first bounded specialist-deliberation layer to COS.

The Council is not a new authority, not a confidence booster, and not a replacement for the primary COS reasoner. It exists to challenge a single reasoning path when metacognitive evidence says routine single-path reasoning is not trustworthy enough.

```text
normal COS retrieval
→ metacognitive Council trigger
→ independent specialist first opinions
→ structured claims / supplied evidence labels / assumptions / observables / falsifiers
→ primary COS reasoner acts as judge/synthesizer
→ existing grounding + specificity + confidence gates
→ external fallback only if COS still cannot clear the normal acceptance boundary
```

## Canonical files

- `saas/lib/ai/cos/cognitiveCouncil.ts`
- `saas/lib/ai/cos/cosReasoner.ts`
- `saas/supabase/migrations/20260814_cos_cognitive_council.sql`
- `saas/tests/cosCognitiveCouncil.node.test.ts`

## Trigger doctrine

Council remains off the routine path.

It may activate for:

- metacognitive `conflicted` capability;
- complex work in a `weak` or `untested` capability region;
- recurring unresolved learning gaps;
- complex work with sparse factual evidence;
- high-consequence work such as production incidents, security/credential issues, destructive operations, deployment/rollback, financial/compliance risk.

Routine strong low-risk work stays on the normal single-reasoner path.

`COS_COUNCIL_ENABLED=false` disables this layer without disabling COS itself.

## Independent-first-opinion doctrine

Initial roles:

- Systems Architect
- Site Reliability Engineer
- Database Specialist
- Security Engineer
- Business and Revenue Specialist
- Skeptic / Red-Team Reviewer

Each triggered Council selects two problem-relevant domain specialists plus the skeptic. Each member gets the same governed COS context and question and does not see other member output.

Members are asked for review artifacts only:

- conclusion;
- claims;
- exact supplied evidence labels only;
- assumptions;
- specific observables;
- falsifiers;
- verification requests;
- member confidence.

No hidden chain-of-thought is requested or persisted.

## Evidence boundary

Council opinions are **not factual evidence**.

The implementation filters member evidence labels against labels that actually existed in the governed prompt. A member cannot manufacture `[KG#]`, `[CL#]`, `[OEM#]`, `[EM#]`, or `[SK#]` labels and have them carried into the advisory.

The primary COS answer remains subject to the existing evidence ceiling, specificity cap, citation accounting and confidence gate in `cosFirstAnswerEnterprise.ts`.

Council confidence values are explicitly advisory and must not be copied into answer confidence.

## No majority vote

The primary COS reasoner receives explicit judge rules:

- synthesize rather than count votes;
- majority agreement is not evidence;
- resolve disagreement using evidence, observables and falsifiers;
- deterministic/tool evidence outranks all Council opinions;
- preserve uncertainty when disagreement cannot be resolved;
- never cite the Council itself as a source.

## Specialist credibility

New table: `cos_council_member_credibility`.

There is **no seeded expertise**.

A role/problem-class stays at neutral weight `1.00` until at least five externally verified cases exist. Only then can verified history move the weight in a bounded range.

This prevents COS from inventing reputation merely because a specialist persona exists.

Future deterministic/human/held-out verification should update this table; model self-agreement must not.

## Durable audit state

New tables:

- `cos_council_sessions`
- `cos_council_opinions`
- `cos_council_member_credibility`

Sessions store trigger state and selected roles. Opinions store only structured review artifacts and the reasoner label. These records can later feed disagreement learning and verified credibility updates.

## Current limitations / next slice

This is the first Council layer, not the final multi-agent architecture.

Not yet implemented:

1. deterministic verifier adapters attached directly to a Council session;
2. post-answer Council verdict persisted back onto the session;
3. externally verified outcome → automatic per-role credibility update;
4. explicit rebuttal/revision round after independent first opinions;
5. frontier/BYOM/BYOA specialist members selected by enterprise policy;
6. Council dashboard/analytics;
7. disagreement → generalized teacher lesson / practice queue automation.

Recommended next slice:

**Council Verification + Disagreement Learning**

- add deterministic/tool verification findings as first-class session artifacts;
- let findings overrule model claims;
- persist the final judge outcome;
- compare each specialist claim with verified outcome;
- update domain credibility only from verified evidence;
- turn resolved disagreements into episodic lessons and candidate procedural skills;
- measure whether Council reduces external frontier calls on the difficult tail without harming calibration.

## Enterprise/BYOM boundary

The first implementation uses independent calls through the existing `LOCAL_AI_*` self-hosted inference seam. The Council abstraction is role-based, not Qwen-specific. Future enterprise adapters can map roles to buyer-approved models/agents without changing the Council evidence/governance contract.
