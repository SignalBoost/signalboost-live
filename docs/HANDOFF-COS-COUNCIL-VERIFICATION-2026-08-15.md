# COS Council Challenge + Verified Outcome Learning Handoff — 2026-08-15

## Scope

This slice advances the production COS Council from independent first opinions to a bounded human-style deliberation lifecycle:

```text
question
→ metacognitive trigger
→ independent specialist first opinions
→ bounded challenge
→ target rebuttal / revision / concession
→ COS synthesis/judgment
→ external/deterministic verification later
→ domain credibility update
```

The challenge and rebuttal stages are advisory reasoning artifacts. They are **not** factual evidence, do not add confidence credit, and do not gain tool/customer credential authority.

## Production evidence at implementation start

Before this slice was merged, production Supabase reported:

- `cos_council_sessions`: 184
- `cos_council_opinions`: 174
- successfully `deliberated` sessions awaiting verification: 55
- verified Council sessions: 0
- specialist credibility rows: 0

Do not retroactively score those 55 sessions without a real verification source. Historical Council agreement is not verification.

## Challenge/rebuttal runtime

Primary file:

- `saas/lib/ai/cos/cognitiveCouncilChallenge.ts`

Integration:

- `saas/lib/ai/cos/cosReasoner.ts`

Rules:

- challenge occurs only after all independent first opinions are complete;
- ordinary Council cases use at most one challenge/rebuttal pair by default;
- high-consequence, conflicted, or repeatedly failing cases may use at most two pairs;
- the skeptic preferentially challenges a claim with weak supplied evidence / more assumptions;
- an additional domain specialist may challenge a different specialist when the two-pair budget applies;
- the target must respond `defend`, `revise`, or `concede`;
- surviving a challenge is not proof;
- conceding a claim permits the judge to drop/revise it but does not establish the challenger as correct;
- exact observables and falsifiers remain central;
- deterministic/tool evidence outranks every Council artifact;
- Council artifacts are never cited as factual sources.

Environment controls:

```dotenv
COS_COUNCIL_CHALLENGE_ENABLED=true
COS_COUNCIL_CHALLENGE_MAX_PAIRS=1
COS_COUNCIL_CHALLENGE_MAX_TOKENS=900
COS_COUNCIL_REBUTTAL_MAX_TOKENS=900
```

`COS_COUNCIL_CHALLENGE_MAX_PAIRS` is bounded to 1–2. High-consequence/conflicted/repeated-gap cases may use 2 even when the ordinary default is 1.

## Durable challenge audit

Migration:

- `saas/supabase/migrations/20260815_cos_council_challenge_verification.sql`

New tables:

- `public.cos_council_challenges`
- `public.cos_council_rebuttals`
- `public.cos_council_verifications`

New session fields:

- `challenge_count`
- `challenge_round_completed_at`
- `verification_source_class`
- `verification_source_ref`
- `verification_findings`

No hidden chain-of-thought is stored. Challenge records contain only the explicit review artifact: target, claim index, challenge, supplied evidence labels, alternative explanation, requested observable and falsifier. Rebuttals contain the explicit response, disposition, optional revised claim and verification request.

## Verified-outcome learning

Primary service:

- `saas/lib/ai/cos/councilVerification.ts`

Owner/admin API:

- `GET /api/admin/cos-council/verification`
- `POST /api/admin/cos-council/verification`

Accepted verification source classes are intentionally narrow:

- `deterministic_tool`
- `human_review`
- `production_outcome`
- `authoritative_record`

Explicitly **not** verification:

- Council majority/consensus;
- another LLM judging the Council;
- the same model restating its answer;
- member confidence scores;
- specialist credibility weights.

The verification request must contain an auditable `sourceRef`, summary, optional findings and per-role verdicts:

- `supported`
- `refuted`
- `not_scored`

`not_scored` does not change credibility. At least one participating role must be supported/refuted.

The atomic database function is:

- `public.cos_record_council_verified_outcome(...)`

It is `SECURITY DEFINER`, execution is revoked from `public`, `anon` and `authenticated`, and granted to `service_role` only. The server-side owner route performs the application-level authorization.

Atomic behavior:

1. lock the Council session;
2. require `deliberated` status;
3. reject unsupported verification source classes;
4. validate that each scored role actually produced an opinion in the session;
5. reject duplicate role verdicts;
6. require at least one externally scored role;
7. write the immutable verification row;
8. upsert domain/problem-class credibility counters;
9. mark the Council session `verified` and record the source reference/findings.

Existing `councilCredibilityWeight()` behavior remains authoritative: specialist weighting stays neutral until at least five verified cases exist for that role/problem class. No fabricated prior reputation is introduced.

## Confidence and evidence doctrine unchanged

This slice does **not** alter answer confidence formulas.

```text
Council opinion confidence != COS answer confidence
challenge survival != factual evidence
credibility weight != factual evidence
verification outcome -> future specialist reliability only
```

Only legitimate KG/CL/OEM evidence and deterministic/tool/authoritative verification can ground factual claims under the existing COS evidence rules.

## Regression coverage

Added:

- `saas/tests/cosCouncilChallengeVerification.node.test.ts`

It covers bounded pair selection, high-consequence two-pair policy, rejection of model consensus as verification, duplicate/not-scored verdict handling, and service-role restriction in the migration.

The production Next.js build type-checks all imported runtime modules. The repository's legacy top-level `npm test` command still manually enumerates test files; unless that script is separately updated, do not claim this newly added Node test is included in that giant enumeration.

## Next recommended slice

After enough real verified outcomes exist:

1. expose Council verification/credibility trends in the operator dashboard;
2. measure per-problem-class calibration of Council use vs single-reasoner use;
3. use verified challenge outcomes as episodic learning evidence;
4. extract reusable procedural improvements only through the existing practice/holdout lifecycle;
5. measure whether Council reduces external-provider escalation and repeat incidents without increasing false certainty.
