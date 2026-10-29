# Hybrid Orchestration Acceptance Implementation Matrix

**Engineering standard:** No parallel orchestration subsystem. Reuse COS, agent-runtime, Builder, Supervisor, Harness, and History. All ten release gates remain **UNVERIFIED** until repository evidence **and** real runtime traces pass.

**Current repository-evidence test:** `saas/tests/hybridOrchestrationGapEvidence.node.test.ts`. Run from `saas/`: `node --experimental-strip-types --test tests/hybridOrchestrationGapEvidence.node.test.ts`. It checks existing modules and prevents mistakenly marking commercial gates complete. It does not simulate deployment, billing, restarting hosts or real provider effects.

| Gate | Source audit; reuse decision | Required executable acceptance implementation and pass condition |
|---|---|---|
| 1. Canonical objective + identity | `lib/agent-runtime/workflow-state.ts` (REUSE); `lib/ai/cos/durableCosTurn.ts` (INTEGRATE) | Staging: send a task through COS and Builder, inspect persisted customer task, assert one stable owner-scoped execution ID, objective unchanged across two plan revisions; explicit amendment history required. **Not implemented.** |
| 2. Duplication inventory | `lib/agentic/taskLifecycle.ts`, `dynamicWorkflowDefinition.ts`, `dynamicWorkflowRunStore.ts` (CONSOLIDATE); `lib/orchestration.ts` (INVENTORY) | Static + integration test: enumerate all live callers and database records; assert every workflow maps to one customer-task authority, old contracts adapt rather than spawn shadow task states. **Not implemented.** |
| 3. Independent policy | `lib/ai/cos/autonomy/guard.ts`, `lib/supervisor/policy-engine.ts` (REUSE) | Staging: adversarial model proposes a forbidden capability and elevated budget; host denies both, no provider call, audit receipt recorded. Repeat through each mutating entry point. **Not implemented.** |
| 4. External-action ledger | `lib/agent-runtime/workflow-store-supabase.ts` (REUSE for task CAS, not proof of action ledger) | Provider sandbox: simulate timeout **after** payment/email/deployment succeeded; same idempotency key returns original operation receipt; exactly one provider side effect, reconciled status. **Not implemented.** |
| 5. Adaptive replanning | `lib/agentic/taskLifecycle.ts`, `lib/builder/agent-v2-job-cycle.ts` (REPAIR / INTEGRATE) | Staging: fail initial Builder strategy, amend plan v1→v2, prove original objective/fixed budget unchanged and verified receipts retained; no widening permission. **Not implemented.** |
| 6. Independent outcome verification | `platform-harness/runtime/runner.ts`, `lib/supervisor/orchestrator.ts` (REUSE) | Staging: tests green and deployment READY but feature intentionally broken; verifier refuses customer completion. Repair, then verify live behavior and close with evidence. **Not implemented.** |
| 7. Browser disconnect + restart | `lib/ai/cos/agentProgressClient.ts`, `lib/ai/cos/durableCosTurn.ts`, `lib/builder/job-store.ts` (REPAIR / INTEGRATE) | Playwright: submit once, drop HTTP response, refresh, restart worker, resume from task ID, verify only one mutation and terminal History. **Not implemented.** |
| 8. History / Stop / Resume / Results | `app/api/assistant/chats/route.ts`, `lib/agent-runtime/workflow-state.ts` (INTEGRATE) | Browser: verify task status after reload, Stop performs host-side cancellation rather than only stopping polling, Resume is authorized, result contains verifier evidence. **Not implemented.** |
| 9. Staging E2E | COS routing, Builder job runner, Supervisor, harness (INTEGRATE) | Playwright staging campaign executes a read-only case and a reversible mutating case; captures network, worker, DB, policy, receipt and verifier telemetry. **Not implemented.** |
| 10. Production rollout and rollback | Existing Vercel deployment and Supervisor control planes (INTEGRATE) | Canary: enable for one owner-scoped cohort, verify feature, induce a failure, automatic rollback restores last known-good deployment/config, confirm recovery in production logs. **Not implemented.** |

## Release evaluation

Each test must supply: commit SHA, environment, canonical task ID, exact objective hash, grant ID, budget, input and result, action receipts, verifier identity, durable History trace, and independent runtime observation. A passing unit test or successful deployment is not a substitute for this evidence.

The immediate engineering gate is the **caller and storage trace**. Decide which existing persistent workflow store can own the canonical customer task after reviewing live callers, schemas, row-level access, and migrations. Until then, introducing a new store or runtime is blocked.

**Evidence audit status:** initial source inspection completed, static repository guards authored, **0/10 full commercial gates verified**.
