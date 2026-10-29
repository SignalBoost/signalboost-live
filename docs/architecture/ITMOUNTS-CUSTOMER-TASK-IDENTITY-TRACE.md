# Customer Task Identity: COS → Builder → Verification → History

Source snapshot: main `16ac985a0cf7e5701804bbaeec8c841abef44fe6`, October 29, 2026. This is source evidence, **not runtime verification**. All commercial gates remain **0/10**.

## Observed ownership and cross-system gaps

| Component / file | Actual identity and caller evidence | Decision |
|---|---|---|
| `saas/app/api/cos-provenance-browser/route.ts` | Authenticated action turn generates `crypto.randomUUID()` `turnId`, pairs with `conversationId`, enqueues `enqueueDurableCosTurn`, invokes worker via `after`, calls `finishDurableCosTurn` | **REUSE + INTEGRATE:** durable COS turn exists, but no evidenced canonical customer-task foreign key |
| `saas/lib/ai/cos/durableCosTurn.ts` | Persists user and assistant messages, tracking `turnId` inside assistant provenance; finalizes that message via `historyMessageId`; scoped by `userId` | **REUSE + REPAIR:** attach canonical task reference only after owner-safe schema and caller audit |
| `saas/lib/ai/cos/agentProgressClient.ts` | Recovers by polling `/api/assistant/chats?id=conversationId`, searches for the durable `turnId`; no replay of submitted POST | **REUSE + INTEGRATE:** one customer task must survive refresh with durable identity and terminal evidence |
| `saas/app/api/assistant/chats/route.ts` | Owner-scoped conversation/history GET with stale job and COS turn reconciliation | **REUSE:** customer-facing History substrate; does not itself prove universal task authority |
| `saas/lib/builder/job-runner.ts` | Uses `job.id` / `jobId`, `userId`, `claimGeneration`, and `finishBuilderJob`; Builder job-specific lifecycle | **REUSE + INTEGRATE:** Builder job is child execution, not independently authoritative customer result |
| `saas/lib/builder/agent-v2-job-cycle.ts` | Claim-generation fence, verified checkpoint state across work slices | **REUSE:** preserve independently validated checkpoint/retry semantics |
| `saas/lib/agent-runtime/workflow-state.ts` | `workflowId`, `requestId`, `userId`, `idempotencyKey`, `requestFingerprint`, version, lease, cancellation | **REUSE candidate:** schema is promising but does not yet contain mandated immutable objective, plan/evidence ledger and verification record |
| `saas/lib/agent-runtime/workflow-store-supabase.ts` | Scoped idempotency lookup and compare-and-set implementation; factory `workflow-store-factory.ts` | **REUSE candidate, NOT selected:** search found no direct `createAgentWorkflowStore` caller; requires verified live consumers, DB schema, migration and access audit |
| `saas/lib/agentic/dynamicWorkflowRunStore.ts` | Separate `workflow_id` and definition-revision CAS checkpoint persistence | **CONSOLIDATE:** not a customer task authority; avoid a second active orchestration ledger |
| `saas/lib/agentic/taskLifecycle.ts` | Separate workflow definition/grant and in-memory execution | **ADAPT OR RETIRE after usage audit:** no demonstrated production usage from initial references |
| `saas/lib/supervisor/orchestrator.ts` | Separate policy, executor, verifier, audit contracts and checkpoint boundary | **REUSE:** retain operational safety role, consume task references without taking ownership |
| `saas/platform-harness/runtime/runner.ts` | `HarnessOutcomeVerifier` plus governed executor and trajectory receipts | **REUSE + INTEGRATE:** independent acceptance check must trace to immutable customer objective |

## Blocker: one task authority is not proven

These identities are distinct, and this audit did **not** find a proven cross-product mapping among COS `turnId`, Builder `jobId`, and agent-runtime `workflowId`. Existing idempotency and checkpoint capabilities are real code, but cannot be represented as a single working customer-task record without live call-graph and storage evidence. No new task store authorized.

## Existing module decisions

- **COS / History:** reuse, connect request identity to child operations and final verifier outcome.
- **Builder:** reuse job lease/checkpoints; parent customer task must not be replaced by Builder's status.
- **Agent-runtime:** evaluate as potential canonical persisted owner **after** active ingress/caller, authorization, RLS, and schema analysis.
- **Agentic dynamic workflow:** reconcile definitions and run storage; no parallel task runtime.
- **Supervisor / Harness:** reuse host policy and independent verifier; receipts must explicitly identify acceptance criterion and trusted observation.

## Implementation order and acceptance tests

1. **P0 Caller and storage proof:** inspect entry point routes and live deployment activity for agent-runtime, Builder, COS turn and agentic stores. Produce a single owner-scoped identity mapping and schema/migration impact assessment. Test: one submitted request yields one parent task ID, one immutable objective hash and linked child IDs across all three persisted stores.
2. **P0 Authority and recovery:** choose an existing store **only after** step 1, wire canonical task reference to COS/Builder/History without breaking old jobs. Test: repeated POST under one client request key and worker restart never duplicate an external action; unknown provider outcome enters reconciliation, not retry.
3. **P0 Host policy:** verify every mutating capability crosses independent grants. Test: modified agent plan cannot elevate scope, credential access or spend.
4. **P1 Adaptive plan:** versioned plan amendments preserve objective and verified receipts. Test: fail first Builder strategy, replan and resume under same budget/grants.
5. **P1 Independent acceptance:** Harness/Supervisor verifier checks original outcome and real runtime evidence. Test: green unit tests, merged PR and Vercel READY still fail customer-success gate when production behavior is absent.
6. **P1 User control:** History/Stop/Resume/Results on parent task. Test: browser closes, worker restarts, History shows correct state; Stop requests server cancellation and Resume retains exact task identity.
7. **P1/P2 Rollout:** isolated staging end-to-end fault injection, followed by production canary and automatic rollback evidence. No success declaration before actual independent observation.

**Acceptance state:** 0/10. The source-only audit confirms reusable modules, not the joined runtime or production behavior.
