# All five Lab phases — launch observability

This advisory contract records **live evidence**, not a certification decision. `saas/lib/ai/cos/labAllPhasesObservability.ts` produces strictly allowlisted, metadata-only Phase 1–5 observations. Exact deployment SHA is mandatory.

| Phase | Required signals |
| --- | --- |
| 1 Factory | factory execution, evaluation integrity, Residency disposition |
| 2 Identity/governance | artifact signature, artifact identity, privacy isolation |
| 3 Tenancy/BYOI | tenant isolation, adapter execution, portable recovery |
| 4 Credit ledger | reservations, measured reconciliation, refund integrity |
| 5 Enterprise pilots | actual partner pilot, rights review, security review |

A trusted tenant-scoped caller must pass validated live runtime or independently reviewed results through `makeLabPhaseObservation` and `emitLabPhaseObservation` to an injected durable sink. Never treat manually fabricated observations as independently verified. Audit and attest the evidence **outside** this event stream.

Use `assessLabPhaseHealth` to expose per-phase `unknown`, `stale`, `blocked`, or `observed`; no event or sink means **unknown**, not green. Synthetic CI results do not count as live evidence. Even all 15 signals observed does not certify or authorize any phase.

Operational follow-up required: wire authenticated emission in the actual Phase 1–5 runtime workflows, tenant-local persistence/access controls, alert routing to the existing supervisor/on-call, live deployment revision attestation, and negative-path end-to-end verification. Until that happens this is **instrumentation scaffolding only**, not production observability.

Do not export PRIVATE data across tenants. No partner IDs, tenant IDs, artifact hashes, evidence documents/locators, prompts, usage receipts, secrets, or free-text errors belong in shared telemetry. Aggregate dashboards require a separate privacy/authorization review.

The existing Phase 5 PR #3890 has a deeper cohort verifier and can remain independent; this cross-phase tracker must not bypass it.
