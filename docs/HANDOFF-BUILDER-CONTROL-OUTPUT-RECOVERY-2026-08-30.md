# Builder Control-Output Recovery

**Date:** 2026-08-30  
**Status:** correction branch; Production acceptance pending

## Production observation

The first authenticated owner repository-repair attempt reached `/api/builder`, resolved the pinned SignalBoost commit, started the isolated repair loop, and invoked the approved COS reasoner successfully. The request nevertheless ended with HTTP 422 and `builder_invalid_model_control_output` before a patch was persisted.

This proves the repository-access route was active. The remaining defects were inside Builder's model-control and proof protocols.

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

## Acceptance boundary

Merge requires mandatory tests, TypeScript, production build, onboarding enforcement, repository-targeting/security checks, and a READY Preview. Runtime acceptance additionally requires a fresh authenticated owner repository-repair attempt in Production that returns a reviewable patch and passing proof evidence. Do not manufacture that observation.
