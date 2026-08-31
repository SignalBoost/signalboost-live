# Builder Control-Output Recovery

**Date:** 2026-08-30  
**Status:** merged and deployed to Production; authenticated owner runtime re-observation pending

## Production observation

The first authenticated owner repository-repair attempt reached `/api/builder`, resolved the pinned SignalBoost commit, started the isolated repair loop, and invoked the approved COS reasoner successfully. The request nevertheless ended with HTTP 422 and `builder_invalid_model_control_output` before a patch was persisted.

This proved the repository-access route was active. The remaining defects were inside Builder's model-control and proof protocols.

## Root causes

1. Repair rounds allowed only 1,600 output tokens, which could truncate a control object containing source text.
2. The prompt incorrectly described every file tool as `{ path, content }`, although `edit_file` requires `{ path, search, replace }`.
3. One malformed or schema-invalid model control response immediately terminated the whole repair turn.
4. Trace serialization could cut JSON at an arbitrary character boundary.
5. A verified repair still spent another model round merely to obtain prose completion.
6. The repair gate recognized test commands but not the TypeScript/typecheck/build command class that produced the real failure.

## Correction

- Give repair controls a bounded 4,096-token output budget.
- Publish exact per-tool input schemas and prefer minimal `edit_file` operations for existing source.
- Validate required tool fields before consuming a work round.
- Recover balanced JSON objects independently when prose or unrelated braces surround the valid control.
- Allow one cache-distinct, bounded control-format retry without exposing the rejected response.
- Preserve trace JSON validity while bounding large strings and old entries.
- Admit bounded test, TypeScript/typecheck, and Next/build commands as repair proof.
- Require the exact same normalized proof command to fail before the repair and pass after it.
- Finish deterministically as soon as fail-before/edit/pass-after evidence satisfies the repair gate.
- Keep repository writes, commits, pushes, merges, deployments, credentials, and production authority unavailable to COS.

## Regression

`saas/tests/builderControlRecovery.node.test.ts` covers:

- the exact `BuilderLoopResult.error` TypeScript failure shape;
- an `edit_file` response using the wrong `{ path, content }` schema;
- truncated JSON recovery with a distinct prompt and larger bounded output budget;
- multiple balanced JSON objects in one model response;
- bounded failure after the single recovery attempt;
- rejection of a different passing command after the original typecheck failure;
- deterministic completion after the same repaired typecheck passes.

The regression is included in `saas/scripts/vercel-cos-gates.mjs` so this path cannot bypass Preview or Production build acceptance.

## Deployment evidence

- PR #1696 merged into `main` as `f22680031abb1ed300490883279aecd573e89914`.
- Preview `dpl_6SWE4Non8aCJGMd16NbQCNvBv1Hy` reached READY on the final feature head.
- Production `dpl_JCX5RDSqYJda6oMMQvagqcAxoG4H` reached READY with `saas.signalboostapp.com`, `www.saas.signalboostapp.com`, and `signalboost-live.vercel.app` attached.
- The merged Production build passed 580 mandatory tests with 0 failures, TypeScript, optimized Next.js build, Playwright, onboarding enforcement, repository targeting, pipeline integrity, and security diagnostics.

## Acceptance boundary

The implementation and Production deployment are accepted. End-to-end repository-repair runtime behavior is still **not** accepted until a fresh, real authenticated owner submission returns a reviewable patch and fail-before/edit/pass-after proof from Production. Do not manufacture that observation.

---

## 2026-08-31 Production follow-up — control aliases and whole-turn deadline

A fresh authenticated owner submission exposed two additional defects after the earlier control-envelope work:

1. The approved Qwen reasoner returned bounded, unambiguous tool intentions in provider shorthand such as `run {"command":"..."}`, `{"type":"run","command":"..."}`, prose followed by that typed JSON object, and `run command: \`...\``. Builder's parser still rejected those shapes even though the tool name and required command were present. The first observed turn ended HTTP 422 after repeated `builder_invalid_model_control_output` events.
2. A second real retry created the isolated repository-repair workspace but produced no terminal assistant-history row and no workspace file. Builder had per-model and per-command limits but no absolute whole-turn deadline below the Assistant page's 290-second deadline and Vercel's 300-second function limit. The browser therefore stopped waiting before the route could persist a recoverable result.

The active correction:

- adds a provider-control adapter that canonicalizes only bounded, unambiguous executable-tool aliases before the existing Builder allowlist and exact input validation;
- keeps malformed, ambiguous, unavailable, or input-invalid controls on the existing fail-closed path;
- gives every Builder turn a server-owned absolute deadline;
- reserves response/persistence time before the browser deadline;
- returns `builder_turn_timeout` as HTTP 504 and persists the terminal result instead of allowing the function to be killed silently;
- skips expensive unverified repository-diff collection after a deadline failure;
- never replays the Builder POST.

New mandatory regressions:

- `saas/tests/builderControlAdapter.node.test.ts` — exact live Qwen aliases, canonical execution through the existing validation boundary, and one terminal deadline error without model retry;
- `saas/tests/builderRequestDeadline.node.test.ts` — route budget remains below the client deadline, timeout results are persisted/returned, and repository repair reserves cleanup time before diff collection.

Acceptance boundary remains strict: exact Preview and Production gates must pass, and a subsequent real authenticated owner repair must return either a reviewable verified patch or a truthful terminal Builder error before the page deadline. A deployment alone is not end-to-end runtime acceptance.
