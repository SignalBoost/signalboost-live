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

Operators:
- `eq`
- `neq`
- `gt`
- `gte`
- `lt`
- `lte`

Expected values are primitive string/number/boolean only. Numeric comparison operators require numbers. There is no eval, regex, arbitrary JSONPath, semantic matching, model interpretation, Council voting, or confidence threshold in the resolver.

## Council pre-registration

`saas/lib/ai/cos/cognitiveCouncil.ts` now lets an independent first-opinion claim optionally include `machine_prediction`.

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

## Skill provenance and learning boundary

`saas/lib/ai/cos/cognitiveSkillContext.ts` now injects the durable skill key alongside `[SK#]`:

```text
[SK1] [skill_key=...]
```

`saas/lib/ai/cos/councilObjectiveOutcome.ts` captures the exact `[SK#] -> skill_key` mapping from governed context into the Council session.

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

## Regression coverage

Added:
- `saas/tests/cosCouncilDeterministicClaimResolution.node.test.ts`

It covers whitelist enforcement, numeric type safety, unresolved missing facts, exact support/refutation, deterministic outcome status, exact skill-key provenance parsing, and SQL safety invariants.

The repository's legacy top-level test command has historically enumerated test files manually. Do not claim this new test runs in CI unless that test runner is separately updated. Production builds type-check the imported runtime modules.

## Preserved concurrent work

This slice was rebased after concurrent COS improvements landed. In particular, it preserves the parallel Council member executor and the newer freshness-aware memory/world-awareness work on `main`; it does not revert or replace them.

## Follow-on

The next useful step is broader objective verifier coverage: route additional deterministic deployment, database read-back, and registered Self-Healing verification results through the same objective-outcome ledger. Claim-resolution coverage should expand only when a provider-neutral fact can be bounded and verified independently; do not add fuzzy or model-judged predicates just to increase scoring volume.
