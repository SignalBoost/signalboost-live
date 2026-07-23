# Mission 002 Phase 4: decision fingerprint binding

Mission 002 now binds a manual-review decision to its Mission ID/revision, environment, action type, schema versions, exact Supervisor `RepairPlan`, and decision ID with SHA-256 fingerprints. Canonical JSON sorts object keys while preserving array and repair-step order. It rejects undefined values, functions, symbols, non-finite numbers, duplicate step IDs, and plaintext secret-like keys or values.

The decision has a maximum one-hour expiry. The safety gateway reparses and recomputes both fingerprints, reloads the mission, rejects stale/terminal/expired records, then evaluates the existing Supervisor Policy Engine. Only exact `approved` outcomes create a fingerprinted policy binding and reach `ai.decisions.approved.v1`; other outcomes emit guardrails only.

The executor reparses both records, validates all fingerprints and binding scope, reloads mission eligibility, and allows only known, non-duplicate approved step IDs before recording `manual_review_routed`. It performs no provider, CI, GitHub, browser, shell, network, or production repair action. This phase has no manual-review queue, persistence schema, or durable binding store; broker delivery alone is never trusted.
