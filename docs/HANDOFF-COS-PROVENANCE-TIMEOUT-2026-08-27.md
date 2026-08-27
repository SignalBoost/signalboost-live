# COS Public Provenance + Fresh-Evidence Timeout Handoff — 2026-08-27

This handoff records two separate Production failures observed on the public Concierge path and the accepted engineering corrections. Where older documentation conflicts with this file, this newer evidence wins.

## 1. Public provenance fabrication — FIXED IN PRODUCTION

Observed sequence:

1. User asked whether direct flights exist from Paramaribo (PBM) to São Paulo.
2. COS performed live retrieval, obtained current public route evidence, invoked Qwen locally, and produced a grounded answer with source URLs.
3. The user then asked where the information came from.
4. The public provenance path asked the model to narrate its own prior execution. The model falsely said the cited websites were “illustrative examples” and that the answer came from general knowledge rather than live retrieval.

This was a provenance integrity failure, not a style defect. Recorded execution history must never be reconstructed by a model.

Accepted fix: PR #1538, merged as `32701e60173510cf02d7f316d25b8057cb325bfa`.

Accepted Production deployment: `dpl_AADtkvEwGaX9XoUNm93tGYDjMhMi` — READY.

Behavior now enforced:

```text
public provenance question
→ identify exact preceding public answer
→ read recorded turn provenance
→ render only public-safe recorded facts/sources
→ if exact provenance cannot be verified: fail closed
```

Never:

```text
public provenance question
→ ask Qwen/another model to explain what happened
```

Both externally reachable public model ingress paths are covered:

- `/api/concierge` → `/api/cos-browser`;
- `/api/support`.

The obsolete model-narrated provenance implementation was removed. `saas/scripts/check-cos-blueprint.mjs` now rejects reintroduction of that pattern during every Vercel prebuild. `saas/tests/publicRecordedProvenance.node.test.ts` includes the PBM→São Paulo regression with recorded FlightConnections/Kiwi URLs and requires `local_model_invoked:false` for provenance introspection.

Accepted #1538 Preview: `dpl_HPMcZwNGoEVXVBiAfLTXCf3TSCJa` — READY.

Mandatory Preview/Production COS gate for the accepted provenance head: **456/456 tests passed, 0 failed** before the later timeout regression expanded the suite.

## 2. Fresh-evidence synthesis timeout after successful live retrieval — FIXED IN PRODUCTION

The same PBM→São Paulo current-fact query exposed a separate transient reliability defect.

Production evidence from deployment `dpl_2steLdcmPq87YbFKmqnooKVoLQzF`:

- live retrieval succeeded;
- `documents_acquired: 8`;
- `authority_satisfied: true`;
- source URLs included FlightConnections, Copa, Kiwi, MakeMyTrip, Trip.com, Expedia, Opodo and GOL;
- the same query had succeeded immediately beforehand with Qwen synthesis latencies of about 1.9 s and 24.7 s;
- one later Qwen/DeepInfra completion stalled until the global 120-second request timeout;
- telemetry recorded `latencyMs: 120004`, `success:false`, `AbortError`;
- external fallback was disabled by policy;
- COS therefore discarded otherwise usable live evidence and returned HTTP 503.

This was not a search/grounding failure. It was a transient local-reasoner transport stall after successful evidence acquisition.

Accepted fix: PR #1539, merged as `84de50b8e67feea2e27d658e4cc3982e9e97a603`.

Accepted Preview: `dpl_GaKEnAJZThcrx4p2B6AQp2YzC7d9` — READY.

Accepted Production: `dpl_8qetGZ2HumG3Cc5RMh1zcxtaZhLF` — READY and attached to `saas.signalboostapp.com`.

Mandatory COS gate: **461/461 tests passed, 0 failed** on the accepted Preview and again in the exact Production build. COS blueprint prebuild guard returned `ok:true` with zero failures; optimized compile, TypeScript, page generation and deployment completed.

New fresh-current synthesis policy:

```text
live current-fact evidence acquired and accepted
→ local evidence-only synthesis attempt 1
   timeout: min(global timeout, 35s default; configurable but bounded 5s–60s)
→ only if attempt throws a transport/timeout exception:
   local evidence-only synthesis attempt 2
→ completed answer must still pass the same evidence contract
→ malformed / unsupported / EVIDENCE_INSUFFICIENT output fails closed immediately
→ external AI remains governed separately
```

Hard boundaries:

- maximum local synthesis attempts: **2**;
- default per-attempt timeout: **35 seconds**;
- retry only thrown transport/timeout failures;
- no retry merely because a completed model answer fails grounding;
- no model-memory fallback;
- no automatic external-AI fallback was introduced;
- existing evidence IDs and server-owned URL rendering remain authoritative.

Implementation:

- `saas/lib/ai/cos/freshEvidenceRetryPolicy.ts` — pure bounded retry/timeout policy;
- `saas/lib/ai/cos/freshEvidenceLocalSynthesis.ts` — production wiring under the existing evidence-only synthesis contract;
- `saas/tests/freshEvidenceLocalSynthesis.node.test.ts` — mandatory retry-policy regression;
- `saas/scripts/vercel-cos-gates.mjs` — includes the retry regression;
- `saas/scripts/check-cos-blueprint.mjs` — enforces two-attempt/35s policy wiring and fail-closed grounding behavior.

## Current acceptance boundary

As of the Production deployment reaching READY, no post-fix interactive `/api/concierge` turn had yet reached `dpl_8qetGZ2HumG3Cc5RMh1zcxtaZhLF`; runtime logs contained only ordinary GET/cron traffic. Therefore:

- **code/regression acceptance:** complete;
- **exact Preview acceptance:** complete;
- **merge to main:** complete;
- **exact Production deployment acceptance:** complete;
- **post-fix live interactive runtime observation:** pending the next real Concierge current-fact request.

Do not manufacture traffic or claim that pending observation has occurred. When the next real current-fact turn arrives, inspect telemetry for either normal first-attempt success or `[cos-fresh-local-synthesis-retry]` followed by a successful second attempt. A later real success is runtime acceptance; a build alone is not.

## Operational invariant

For current public facts:

```text
fresh evidence authority
≠ reasoner transport availability
```

A transient reasoner transport failure may be retried within a strict bounded budget, but it may never weaken grounding requirements. Conversely, successful live retrieval must not be rewritten after the fact as “general knowledge” or “illustrative sources.” Recorded provenance remains the sole authority for explaining how an answer was produced.
