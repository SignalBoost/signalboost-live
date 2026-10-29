<!-- docs/architecture/ITMOUNTS-HYBRID-CALLER-DATAFLOW-TRACE.md -->
# Hybrid task authority: caller and data-flow trace (read-only findings)

> **Superseded 2026-10-29 by [`ITMOUNTS-HYBRID-ORCHESTRATION-GAP-ANALYSIS.md`](ITMOUNTS-HYBRID-ORCHESTRATION-GAP-ANALYSIS.md), the single canonical plan.** Kept as dated evidence only; do not plan from this file.

Audit date: 2026-10-29. Source-level evidence only. No customer task authority is yet selected, and no commercial gate is declared passed.

## Traced entry points and state

| Entry / module | Source function or contract | State currently owned | Integration conclusion |
|---|---|---|---|
| `saas/app/api/cos-browser/route.ts` | `executeBrowserTurn` → `cosPrimaryPost`, Builder/campaign routes | Browser request and conversation context | **REUSE + INTEGRATE:** route all customer requests into an existing durable task identity before dispatch |
| `saas/app/api/cos-primary/route.ts` | `postCosPrimary`; prompt handling, execution provenance | Per-turn reply and intent | **REUSE + REPAIR:** bind objective and acceptance contract once, preserve on replans |
| `saas/lib/ai/cos/agentLoop/cosAgentLoop.ts` | governed model-tool loop | Agent observations, tool steps | **REUSE:** only proposes/plans steps, not task authority |
| `saas/lib/ai/cos/durableCosTurn.ts` | `enqueueDurableCosTurn`, `finishDurableCosTurn`, `expireStaleDurableCosTurns` | Assistant message provenance keyed by turnId | **INTEGRATE:** bind turnId to one customer task; stale “worker_lost” is not provider reconciliation |
| `saas/lib/ai/cos/agentProgressClient.ts` | `postWithAgentProgress`, History watcher | Browser transport and conversationId | **REPAIR:** preserve task identity and show uncertain/running rather than duplicate POST |
| `saas/app/api/assistant/chats/route.ts` | `GET` / `DELETE`; Builder History reconciliation | Conversation/messages | **INTEGRATE:** expose authoritative task with receipts, Stop/Resume/Results |
| `saas/lib/builder/agent-v2-job-cycle.ts` | `runBuilderV2JobCycle`, `BuilderV2LeaseStore` | Builder leased checkpoint, claimGeneration | **REUSE + INTEGRATE:** Builder job is a child execution, not an independent customer outcome |
| `saas/lib/builder/agent-v2-supabase-store.ts` | Builder V2 lease store | Builder job checkpoints | **REUSE:** retain generation fencing; map job ID into task record |
| `saas/lib/agent-runtime/workflow-state.ts` | `AgentWorkflowState` | workflowId, requestId, userId, idempotencyKey, fingerprint, lease, cancellation | **REUSE CANDIDATE:** inspect live consumers and DB ownership before selecting as canonical authority; objective/ledger/verifier fields not present |
| `saas/lib/agent-runtime/workflow-store-supabase.ts` | `SupabaseAgentWorkflowStore` | Durable CAS workflow state | **REUSE:** preserve existing compare-and-set/lease policies |
| `saas/agent-operations-host/signalboostAgentOperationsHost.ts` | `AgentWorkflowCoordinator` | Agent operations workflow | **INTEGRATE:** distinct execution domain, not evidence COS uses this as its task store |
| `saas/lib/agentic/dynamicWorkflowDefinition.ts` / `dynamicWorkflowStore.ts` | Definition validation / immutable revision storage | Plans and graph revisions | **INTEGRATE:** plans remain subordinate to customer task **Removed 2026-10-29: no production caller.** |
| `saas/lib/agentic/dynamicWorkflowRun.ts` / `dynamicWorkflowRunStore.ts` | `claimDynamicWorkflowStep`, generation-fenced save | Separate run state | **CONSOLIDATE AFTER USAGE AUDIT:** do not create second task authority **Removed 2026-10-29: no production caller.** |
| `saas/lib/agentic/taskLifecycle.ts` | `executeDynamicWorkflow`, `validateDynamicWorkflow` | Overlapping flow interpreter | **REPAIR/RETIRE AFTER CALLER AUDIT:** do not build more parallel engines |
| `saas/lib/ai/cos/autonomy/guard.ts` / `saas/lib/supervisor/policy-engine.ts` | capability guard / policy evaluator | Execution authority decisions | **REUSE + INTEGRATE:** prove every consequential boundary invokes host policy |
| `saas/lib/supervisor/orchestrator.ts` | thinker, policy, executor, verifier, rollback | Operational remediation | **REUSE:** infrastructure recovery is not a public task store |
| `saas/platform-harness/runtime/runner.ts` | governed runner + evidence trajectory | Execution events | **INTEGRATE:** receipts link to original objective |
| `saas/platform-harness/verification/outcome-verifier.ts` | `HarnessTrajectoryVerifier` | Tool-trajectory verification | **REUSE + REPAIR:** different execution/evaluation evidence when possible |
| `saas/lib/ai/cos/answerTaskContract.ts` | `evaluateTaskOutcome` | Analytical deliverables, evidence verdict | **REUSE + REPAIR:** production outcome verification must be independent and test actual user acceptance |

## Observed wiring and unproven links

1. Browser ingress has an explicit COS route; durable COS turns persist as assistant messages and History reads them.
2. Builder has its own lease generation and checkpoint lifecycle.
3. Agent-runtime workflow has its own idempotent state and CAS persistence; dynamic workflows have another definition/run storage model.
4. Repository code search for `createDynamicWorkflowRunCheckpointStore` and `claimDynamicWorkflowStep` returned only their module and test files; COS/Builder adoption is **not demonstrated**.
5. No evidence in this source audit proves one immutable objective, one cross-capability external-action ledger, independently verified production acceptance, or full restart recovery.

**Decision:** Do not select a canonical task store yet. The existing agent-runtime workflow store is a candidate, not a verified owner of COS/Builder tasks. Perform DB/table and live caller review before integration; no schema creation by default.

## Acceptance tests

Committed baseline: `saas/tests/hybridOrchestrationAcceptance.node.test.ts`.
Implemented tests: current-schema diagnostic, unregistered capability rejection, incomplete outcome when execution evidence missing, and blocked step replay after interruption.
The 10 commercial gates are separately expressed as `test.todo` with staging/API/Playwright acceptance scenarios. TODOs are not passes and must be implemented with real clients, staging workers, provider receipts and restart/rollback fault injection before a gate can be approved.

## Next integration change (requires proof)

Trace the exact runtime user IDs, conversation IDs, turn IDs, Builder job IDs, and workflow IDs through their production creation sites. Write an identity mapping for existing records (no blanket identifier reuse), then choose an existing persistent authority and implement the smallest adapter. Preserve immutable customer objective and approvals across changes. Every action needs separate provider-scoped idempotency and reconciliation; HTTP timeout and checkpoint existence do not prove side-effect outcome.

Release decision: **0 / 10 commercial gates verified**. No new orchestration implementation permitted.
