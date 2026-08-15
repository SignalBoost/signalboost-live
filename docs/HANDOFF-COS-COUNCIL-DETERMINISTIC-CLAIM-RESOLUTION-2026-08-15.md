# COS Council Deterministic Claim Resolution — Handoff — 2026-08-15

## Purpose

This slice closes the conservative feedback loop from objective operation evidence to Council predictive credibility.

The core invariant is:

```text
objective outcome -> exact pre-registered prediction resolution
objective outcome != blanket specialist correctness
Council agreement != evidence
```

A Council specialist may register an optional machine-checkable prediction before the objective result exists. Later, bounded deterministic facts can support or refute that prediction mechanically. Missing, partial, or mixed evidence remains unscored.

## Runtime flow

```text
Council independent first opinion
→ optional bounded machine_prediction persisted with claim
→ governed operation / deterministic read-back
→ objective outcome ledger
→ exact Council session correlation
→ deterministic claim resolver (no model call)
→ claim resolution rows
→ full + unanimous role resolution only
→ specialist predictive credibility update
→ refuted role opens/reopens learning gap
→ supported role may credit one unambiguous cited validated skill
```

## Machine prediction contract

File: `saas/lib/ai/cos/councilMachinePrediction.ts`

Predictions support only fixed bounded fact paths already allowed into the objective outcome ledger, plus `outcome_status`.

Operators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`.

Expected values are primitive string/number/boolean only. Numeric comparison operators require numbers. There is no eval, regex, arbitrary JSONPath, semantic matching, model interpretation, Council voting, or confidence threshold in the resolver.

## Council pre-registration

`saas/lib/ai/cos/cognitiveCouncil.ts` lets an independent first-opinion claim optionally include `machine_prediction`.

Important boundaries:
- specialists are told to omit a machine prediction when an observable would only prove generic recovery rather than discriminate their claim;
- invalid fact paths/operators are discarded by the parser;
- machine predictions are persisted before the objective outcome exists;
- they are displayed in the Council advisory as future falsifiability contracts, not current factual evidence;
- the existing parallel Council member executor remains intact.

## Deterministic resolver

File: `saas/lib/ai/cos/councilClaimResolution.ts`

The resolver:
1. reads one immutable objective outcome and its exact matched Council session;
2. reads the persisted Council opinions;
3. resolves each valid pre-registered prediction from the bounded objective facts;
4. stores only resolved `supported`/`refuted` comparisons;
5. leaves missing objective facts unresolved;
6. scores a role only if every machine prediction it registered is resolved by that same outcome and all resolved verdicts agree;
7. never calls a model.

A role with mixed supported/refuted predictions is not scored. A role with three registered predictions and only two objective facts is not scored.

## Retry-safe objective evidence identity

A post-merge review of the preceding objective-outcome slice found a real retry hazard: native Self-Healing originally reused `${incident_id}:repair:${step}` as the Agent Gateway request identity. A failed repair attempt followed by a later successful attempt for the same fingerprint could therefore collide in the objective-outcome ledger and leave stale evidence.

This slice fixes that boundary:
- `DispatchRepairPlanOptions` now accepts `executionAttemptId`;
- native Self-Healing passes the incident's stable `detectedAt` value as the attempt identity;
- the Agent Gateway request id becomes `${incident}:repair:${step}:attempt:${detectedAt}` for native remediation;
- replaying the same detected incident remains idempotent because its `detectedAt` is stable;
- a genuinely later detection gets a different request/source reference, so later success cannot be discarded behind an earlier failure.

This preserves the existing objective-ledger uniqueness rule without fabricating random write-time identifiers.

## Skill provenance and learning boundary

`saas/lib/ai/cos/cognitiveSkillContext.ts` injects the durable skill key alongside `[SK#]`:

```text
[SK1] [skill_key=...]
```

The exact `[SK#] -> skill_key` mapping is captured from governed context into the Council session.

A supported role may record positive production evidence for a cognitive skill only when all scored prediction claims unambiguously cite the same single `[SK#]` procedure. This uses the existing externally verified cognitive production-outcome path.

A refuted specialist prediction does **not** automatically weaken or quarantine a cited skill. A specialist can misapply a good procedure. Instead, the database creates or reopens a `cos_learning_gaps` item with `deterministic_council_prediction_refuted` so the failure can be investigated and practiced safely.

## Database

Migration: `saas/supabase/migrations/20260815_cos_council_deterministic_claim_resolution.sql`

Applied to production as migration `cos_council_deterministic_claim_resolution`.

Session additions:
- `cognitive_skill_refs`
- `objective_claim_resolution_count`
- `objective_role_score_count`

New RLS-enabled tables:
- `cos_council_claim_resolutions`
- `cos_council_role_objective_scores`

Service-role RPC:
- `cos_record_council_objective_role_score(uuid,uuid,text,text,integer,jsonb)`

The RPC independently validates that:
- the objective outcome belongs to the supplied Council session;
- the role actually produced an opinion;
- the role had pre-registered machine predictions;
- all registered predictions are resolved by this exact outcome;
- there is exactly one resolved verdict for the role;
- one automatic score is recorded at most once per role/session.

EXECUTE is granted only to `postgres` and `service_role`; `public`, `anon`, and `authenticated` do not have EXECUTE.

## Production starting state

Immediately after migration, without synthetic incidents or fabricated evidence:
- claim resolutions: 0
- role objective scores: 0
- sessions with claim resolutions: 0
- sessions with role objective scores: 0

The first real qualifying governed operation will populate the ledger automatically.

## Regression coverage and strip-safe boundary

Tests:
- `saas/tests/cosCouncilObjectiveOutcome.node.test.ts`
- `saas/tests/cosCouncilDeterministicClaimResolution.node.test.ts`

A review found that the older objective-outcome test imported the database-backed runtime through `@/`, which made direct `node --test` loading fail before assertions ran. This slice fixes the dependency boundary rather than hiding it behind an alias loader:
- `saas/lib/ai/cos/councilObjectiveOutcomePure.ts` now contains the pure correlation/classification/bounded-fact logic;
- `saas/lib/ai/cos/councilPromptProvenance.ts` contains the pure `[SK#] -> skill_key` parser;
- the runtime database wrapper re-exports the pure objective API;
- both tests use direct relative `.ts` imports and no longer initialize Supabase merely to test deterministic helpers.

The repository's top-level `npm test` command still manually enumerates a very large list of test files. These two tests are directly runnable with Node now, but do not claim they are included in that legacy aggregate command unless the list is separately updated. `validate:strip-safe` and the production TypeScript build remain merge gates.

## Preserved concurrent work

This slice was rebased after concurrent COS improvements landed. It preserves the parallel Council member executor and the freshness-aware memory/world-awareness work merged through PR #1206; it does not revert or replace them.

## Follow-on

The next useful step is broader objective verifier coverage: route additional deterministic deployment, database read-back, and registered Self-Healing verification results through the same objective-outcome ledger. Claim-resolution coverage should expand only when a provider-neutral fact can be bounded and verified independently; do not add fuzzy or model-judged predicates merely to increase scoring volume.
