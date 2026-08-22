# COS Reasoning Control Plane — Phase 3

## Objective

Turn the Phase 2 provider-neutral gateway into a real COS-owned capability router while keeping the current approved Qwen/DeepInfra runtime as the underlying open-model inference engine.

## What Phase 3 changes

- COS deterministically selects one of five roles: `primary`, `coder`, `critic`, `verifier`, `researcher`.
- Routing uses the actual user-question segment, not injected Knowledge Graph, learning-corpus, Enterprise Memory, or live-evidence text.
- Role selection adds zero model calls and therefore no classifier-model cost or latency.
- Specialist roles use bounded role instructions while preserving the caller's existing output contract.
- Explicit token requests are capped by role; an unspecified token budget is never increased.
- All default roles retain the same underlying reasoner label, so COS does not pretend that prompt specialization is a different model.
- A failed specialist does not retry the same underlying model as `primary`; that would duplicate cost without adding independent capability.
- If a future specialist uses a genuinely different runtime/model label, primary becomes a bounded fallback automatically.
- Closed-model workers remain excluded unless a separate orchestration layer explicitly permits external escalation.

## Default role policy

- `coder`: implementation, code, scripts, SQL, APIs, repository/patch/refactor tasks.
- `verifier`: current/latest/live verification tasks.
- `critic`: diagnostics, incidents, root-cause analysis, audits and stress tests.
- `researcher`: stable explanations, definitions, comparisons and evidence synthesis.
- `primary`: general reasoning that does not need a specialist contract.

## Cost boundary

Current role token caps are ceilings, not allocations:

- primary: 6000
- coder: 6000
- critic: 4200
- verifier: 2400
- researcher: 3600

If the caller asks for fewer tokens, COS keeps the lower value. If the caller supplies no max-token value, Phase 3 leaves it unset so the existing raw-inference default remains authoritative.

## Independence boundary

Phase 3 does not add Claude, OpenAI, Gemini, or another closed provider to the COS worker set. Qwen/DeepInfra remains a replaceable worker runtime under COS control. External AI continues to require the separate explicit escalation path.

## Next phase

Use measured turn outcomes, benchmark results, latency and cost telemetry to learn worker/model preferences by problem class. That phase should remain evidence-gated: COS may recommend or shadow a routing change before any autonomous production promotion.
