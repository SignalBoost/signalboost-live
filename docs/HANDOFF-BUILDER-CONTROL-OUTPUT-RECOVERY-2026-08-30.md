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
