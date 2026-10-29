# iTMounts Hybrid Orchestration — Gap Analysis and Integration Plan

**Decision:** Adopt as the canonical engineering standard. **Hold:** new orchestration engines and duplicate task stores. **Scope:** repository evidence at main `e98fe15f48829589e97b525d44e53d5acf563f3e` (2026-10-29). Runtime, production, and staging acceptance have **not** been demonstrated by this source-only audit.

## Non-negotiable ownership model
- **COS:** customer relationship, immutable customer objective and explicitly recorded amendments.
- **Orchestrator:** versioned, revisable execution plan; preserves completed proof and original objective.
- **Independent policy:** host-side authorization, spend/time ceilings, provider-specific idempotency and reconciliation. Model output cannot grant authority.
- **Capability executors:** Builder, Provider Hub, Playwright, REA, University, APIs; scoped to grants.
- **Independent verifier:** determines whether original objective has been met, using receipts and external evidence where appropriate; an executor cannot certify its own success.
- **Customer:** one task in History with progress, Stop, Resume, and final evidence, irrespective of browser connection.

## Repository evidence and decisions

| Responsibility | Current evidence (file) | Observed implementation | Decision | Gap / integration requirement |
|---|---|---|---|---|
| COS intent and instruction integrity | `saas/lib/ai/cos/cosExecutionEnvelope.ts`, `saas/app/api/cos-browser/route.ts` | Instruction contract, routing and transcript guards | **Reuse + repair** | Persist objective separately from editable prompts/plans; prove ambiguous quoted text cannot authorize execution |
| General orchestration | `saas/lib/orchestration.ts`, `saas/app/api/orchestration/route.ts` | Intent and workflow planning | **Integrate** | Identify real live consumers; do not nominate it as a new source of task truth |
| Existing durable workflow runtime | `saas/lib/agent-runtime/workflow-state.ts`, `workflow-store.ts`, `workflow-store-supabase.ts` | `requestId`, `workflowId`, `userId`, `idempotencyKey`, request fingerprint, status, version, lease, cancellation, compare-and-set, recoverable listing | **Reuse first** | Determine runtime scope and whether it can back one customer-visible task without rewriting active jobs |
| Declarative workflows | `saas/lib/agentic/dynamicWorkflowDefinition.ts`, `workflowContract.ts`, `dynamicWorkflowStore.ts` | Governed definitions and historical conversion | **Integrate; no third schema** | Map definition revisions to canonical task/plan versions; reconcile duplicate legacy contract |
| Additional workflow checkpoints | `saas/lib/agentic/dynamicWorkflowRun.ts`, `dynamicWorkflowRunStore.ts` | Revision-pinned runs and generation-fenced state writes | **Evaluate for consolidation** | Must not become a second authoritative customer task; verify creation and live database migration before adoption |
| Legacy agentic executor | `saas/lib/agentic/taskLifecycle.ts` | Dependency ordering, approval grant, host receipts | **Repair or adapt** | Existing executor is distinct from durable runtime; decide adapter or retirement after usage inventory |
| Builder durable jobs | `saas/lib/builder/agent-v2-job-cycle.ts`, `saas/lib/builder/job-store.ts` | Leased jobs, checkpoint and claim-generation protection, stale-job reconciliation | **Reuse + integrate** | Builder jobs become child executions of a customer task; don't copy their checkpoint implementation |
| COS durable turns and History | `saas/lib/ai/cos/durableCosTurn.ts`, `saas/lib/ai/cos/agentProgressClient.ts`, `saas/app/api/assistant/chats/route.ts` | History-backed durable turn IDs, server completion, browser GET polling, stale reconciliation | **Repair + integrate** | Turn ID must map to customer task ID; distinguish pending, succeeded, failed, unknown; recover exact request without repeat POST |
| Independent execution policy | `saas/lib/ai/cos/autonomy/guard.ts`, `saas/lib/supervisor/policy-engine.ts`, `saas/lib/supervisor/execution-contracts.ts` | Host capability guard, supervisor policy contracts | **Reuse + unify boundary** | Prove all high-impact tool routes cross policy; model-selected plan cannot widen grants |
| Supervisor | `saas/lib/supervisor/orchestrator.ts` | Separates thinker, policy engine, executor, verifier, audit and transaction checkpoints | **Reuse as policy/repair capability** | Keep operational security/recovery responsibility distinct; do not make Supervisor a parallel public COS |
| Platform harness and verifier | `saas/platform-harness/runtime/runner.ts`, `saas/platform-harness/verification/outcome-verifier.ts` | Governed action execution, compensation, trajectory evidence, outcome-verifier interface | **Reuse + integrate** | Bind verification to original customer acceptance contract and production evidence; separate executor and verifier trust |
| University | University and supervisor references in `ONBOARD.md` | Existing learning, evaluation and graduate pathways | **Integrate later** | Learn only from verified, policy-compliant outcomes; not a completion authority |

**Evidence limits:** A file's existence is not proof of deployment, adoption, correct permission wiring, active DB migration, or live recovery. This report is a repository architecture inventory, not a claim that an end-to-end system is already functioning.

## Integration work, in order

### P0 — One authoritative task and acceptance contract
1. Inventory actual callers, database tables, migrations and API owners for `agent-runtime`, `agentic`, COS turns and Builder jobs. Publish a mapping, including references that cannot safely share identifiers.
2. Select a **single existing store** as canonical after reviewing its access controls and migrations; avoid creating yet another task table by default.
3. Record immutable objective + immutable amendment history, user scope, stable task ID, acceptance criteria, policy grant references, budget, plan version, child execution IDs, action evidence and terminal verifier outcome.
4. Enforce a single public task status and monotonic/compare-and-set transitions. No agent can declare terminal customer success without verifier evidence.

### P0 — Cross-capability admission, idempotency and reconciliation
1. Bind tool calls to a host-owned grant and capability-specific operation key; reject widened permission after replanning.
2. Inventory irreversible writes (payments, email, deployment, filesystem, external APIs); per capability specify read-before-retry, provider lookup, re-entry rules and compensating action.
3. Distinguish **retryable**, **checkpoint-resumable**, **uncertain external outcome**, **authorization blocked**, and **terminal** states. Uncertain external outcomes must be reconciled, not blindly retried.

### P1 — Controlled adaptive replanning and independent verification
1. Persist each plan revision independently from the original objective. Record why a strategy changes and which receipts remain valid.
2. A verifier checks every customer requirement against authoritative evidence. Report `verified_success`, `repairable_failure`, `blocked_permission`, `external_dependency`, or `unverified`; no implied success from tests/PR/READY status alone.
3. Bounded repair may change plan but cannot increase budget, privilege or external side effects. Use deadlines, stagnation checks and transparent terminal states.

### P1 — Customer controls and acceptance
1. One History task view with status, Stop, Resume, child jobs and attached evidence. Stop must request host-side cancellation where permitted; cancelling UI polling alone is insufficient.
2. Staging tests: lost HTTP envelope after server accept, browser reload, concurrent duplicate POST, worker crash after external success but before receipt, stale lease, policy denial, partial Builder success, deployment READY but feature failure.
3. Production canary and rollback: one low-risk read-only task, then governed mutating task; verify real customer outcome, monitoring, and rollback before broad enablement.

## Commercial readiness gate — 0 of 10 independently confirmed

- [ ] Canonical customer objective and stable execution identity, with amendment journal.
- [ ] Every existing component assigned **reuse / integrate / repair / replace**, backed by caller analysis.
- [ ] Independent policy enforcement on all consequential execution paths.
- [ ] Durable external-action ledger with provider idempotency/reconciliation.
- [ ] Adaptive replanning without objective mutation or privilege escalation.
- [ ] Independent objective-level outcome verification.
- [ ] Proven browser-disconnect and worker-restart recovery without duplicated effects.
- [ ] Customer-facing History, Stop, Resume and verifiable final results.
- [ ] Staging end-to-end acceptance evidence, including failure injection.
- [ ] Controlled production rollout and verified rollback.

**Release rule:** Missing, ambiguous or unverified evidence means NOT PASS. Do not treat code commits, green CI, merged PRs or Vercel READY as customer-outcome proof.

## Immediate next engineering deliverable

A **caller-and-data-flow trace** from `/api/cos-browser` and durable COS turns through task identity, host authorization, Builder/other executors, verifier, and History, with file+function references and real staging receipts. This trace determines which existing state store becomes the task authority. Until that evidence exists, adding a new orchestration runtime remains **on hold**.
