<!-- docs/architecture/ITMOUNTS-HYBRID-ORCHESTRATION-GAP-ANALYSIS.md -->
# iTMounts Orchestration — Gap Analysis and Integration Plan (canonical)

**This is the single canonical plan** for making COS and Builder V2 one dependable assistant under the iTMounts Formal Engineering Standard. It supersedes `ITMOUNTS-CUSTOMER-TASK-IDENTITY-TRACE.md`, `ITMOUNTS-HYBRID-CALLER-DATAFLOW-TRACE.md` and `ITMOUNTS-LIVE-TASK-STORE-SCHEMA-AUDIT-20261029.md`, which remain as dated evidence only. Change the plan here, in one place; do not start a parallel plan, task store or orchestrator.

Evidence: source audit of `main` at `16ac985` (2026-10-29), every component traced to its production callers (imports from `app/` routes and crons, tests excluded), updated for #5043 and #5044. Not runtime proof: a file existing is not counted as working.

## Verdict

0 of 10 gates pass; 5 are partial, 4 are missing, and 1 (the component decisions below) is delivered for owner approval. The parts exist but are not connected. A Builder job has a real task record (`builder_jobs`: objective never updated after insert, fenced checkpoints, host-run proof). A COS turn has none: it is a pair of `assistant_messages` rows tagged in `provenance`, and nothing links it to the Builder job it starts. The plan makes `builder_jobs` the single Customer Task Record and routes every COS turn through it.

## The 10-point gate today

| # | Gate | Status | What exists | What is missing |
|---|---|---|---|---|
| 1 | One canonical objective and execution identity | Missing | `builder_jobs.objective` never updated by code; job `id` fenced by `claim_generation` | COS turns have no table (`turnId` inside `assistant_messages.provenance`); no turn↔job link; no database guard on the objective |
| 2 | Decision per component | Delivered for approval | This document | Owner approval |
| 3 | Policy enforced outside the model prompt | Partial | Harness manifest fails closed (`platform-harness/core/policy.ts`); governed executor halts financial and destructive actions; Builder spend cap enforced in the database (`reserve_builder_inference`); request body can no longer grant Hub approval (#5044) | Ads approvers are free text (`app/api/ads/route.ts:428-435`); a COS turn has a deadline but no spend ceiling (`adapters/cos-ingress.ts`) |
| 4 | Durable external-action ledger, idempotency, reconciliation | Missing | Only Stripe inbound webhooks (`stripe_processed_events`) and Builder inference reservations | Email, social, ads, deploys and PR merges send no idempotency key and record the action only after the provider call (ads: a `pending` row never resolved) |
| 5 | Replanning without changing the objective | Partial | Builder V2 rejects a resume whose objective digest changed (`agent-v2.ts:416-418`) | Repair replan rewrites the stored objective (`repository-repair-job.ts:78-80`); no plan version anywhere |
| 6 | Independent outcome verification | Partial | Builder: host re-runs the proof and reads receipts (`repository-repair-proof-controller.ts`, `final-proof.ts`) | Builder criteria regex-parsed from the objective; COS "done" is word rules (`answerTaskContract.ts`) plus a checker on the writer's own model; `evaluateTaskOutcome` is log-only; the harness verifier serves only University training |
| 7 | Recovery from browser disconnect and restart | Partial | Builder resumes from checkpoint (cron every minute); Developer page re-attaches after reload | History and polling expiry mark a checkpointed job `worker_lost` from `updated_at` only (migration `20261014210000`), racing the resume; a COS turn is never resumed and a reload cannot re-attach |
| 8 | History, Stop, Resume, verified Results | Partial | Builder Stop cancels on the server; Developer page shows test evidence; History returns a conversation's Builder jobs (#5043) | Assistant-page Stop aborts only the browser; no Resume; History list shows no task status; no PR or preview link; Builder labels English only |
| 9 | Staging end-to-end acceptance | Missing | Production-only Playwright run (University) every 6 hours; a staging Supabase project exists without the app schema (per #5041) | No staging environment for the app; no browser test of Assistant, Builder or Concierge in CI |
| 10 | Controlled rollout with automatic rollback | Missing | Rollback for Builder auto-merge only | `vercel-promote-main` promotes straight to production with no health check; merge-watch cron not scheduled; GitHub reports `main` unprotected (no required checks, no rulesets) |

## Component decisions

| Component | Production callers | Decision | Why |
|---|---|---|---|
| `builder_jobs` + `lib/builder/job-store.ts`, `job-runner.ts`, `agent-v2-job-cycle.ts` | `/api/builder`, `/api/cos-browser`, cron `builder-continuations` | Reuse | Only store with typed status, fencing, checkpoint, heartbeat, immutable-by-code objective and a DB spend cap. Becomes the Customer Task Record. |
| `lib/ai/cos/durableCosTurn.ts`, `app/api/cos-provenance-browser/route.ts` | Assistant, Concierge | Repair | Only external-action turns are durable. Every turn gets a task record; `turnId` = record id. |
| `app/api/assistant/chats/route.ts` | Assistant | Repair | No task status in the list; its lazy expiry kills checkpointed jobs. Read status from the record; leave recovery to the cron. |
| `app/api/cos-browser/route.ts`, `app/api/cos-primary/route.ts` | All chat surfaces | Reuse | Front door opens or attaches the task record before any lane runs. |
| `lib/ai/cos/cosTurnIntent.ts`, `cosSemanticTaskIntent.ts` | Front door, COS, answer step | Integrate | One model decision per turn (#5007); its kind, permission and deliverables are written into the record. |
| `lib/ai/cos/instructionContract.ts` (`compileCosInstructionContract`), `lib/builder/task-contract.ts` | `/api/builder`, Software Specialist, agent loop, Builder V2 | Replace | Permission and deliverables guessed by regex; replaced by what the intent judge records. Host spend and approval gates stay as the hard floor. |
| `lib/ai/cos/answerTaskContract.ts`, `cosExecutionEnvelope.ts` | `cosReasoner.ts`, `cos-primary` | Repair | Word-count "done"; `complete:false` hard-coded; `evaluateTaskOutcome` log-only. Become verifier inputs, not the verdict. |
| `lib/agentic/taskLifecycle.ts` | `agent-v2.ts`, `cosExecutionEnvelope.ts` | Remove | Wrapper around Builder's existing `acceptancePassed`; in COS constructed and never advanced. |
| `lib/agentic/dynamicWorkflow*.ts`, `workflowContract.ts`, migrations for `agentic_workflow_definitions` / `agentic_workflow_runs` | None (tests only) | Removed 2026-10-29 | Parallel task store with no production writer; tables not observed in the live database (#5041). |
| `platform-harness/core/policy.ts`, `runtime/governed-executor.ts`, `runtime/host-ingress.ts`, `adapters/cos-ingress.ts` | `cos-primary`, `job-runner`, supervisor routes | Reuse | Host-side policy floor; grants snapshotted into the record. |
| `platform-harness/runtime/cost-budget.ts`, `execution-context.ts` | Builder only | Repair | Port unimplemented; in-memory ledger resets per call. Implement on `builder_inference_budgets`; give COS turns a ceiling. |
| `repository-repair-proof-controller.ts`, `final-proof.ts`, `acceptance-ledger.ts`, `acceptance-report.ts` | `job-runner`, `repository-repair` | Reuse | Host-run, separate from the agent: the pattern for every capability. |
| `platform-harness/verification/outcome-verifier.ts` | University only | Reuse | Already refuses "verified" without evidence; becomes the one verifier contract for customer tasks. |
| `agent-v2.ts:180-252` completion criteria | Builder V2 | Repair | Criteria regex-parsed from the objective; take them from the record's deliverables. |
| Builder checkpoints + cron `builder-continuations` | Cron every minute | Reuse | Fenced, digest-checked, resumes up to 3 times. |
| `repository-repair-replan.ts` | Repair enqueue | Integrate | Writes a plan revision instead of rewriting the objective. |
| `repository-repair-automerge.ts`, `repository-merge-watch.ts`, `repository-production-acceptance.ts`, cron `builder-merge-watch` | Repository repair | Integrate | Schedule the cron; pin the merge to the checked commit (`automerge.ts:228`). |
| `app/dashboard/assistant/page.tsx` Stop | Assistant | Repair | Calls the server cancel (`stopBuilderJobForUser`), extended to COS turns. |
| `app/dashboard/developer/page.tsx`, `components/AssistantTransportBoundary.tsx` | Developer, Assistant | Repair | Add PR and preview links; translate Builder labels into the 11 languages. |
| `app/api/hub/run/route.ts` | Hub console | Repair (partly done, #5044) | Body can no longer grant approval; owner-approved actions need a server-side approval flow. |
| Outreach send, social publish, campaign publish, ads | Marketing & Sales | Integrate | Write through the external-action ledger. |
| `.github/scripts/vercel-promote-main.mjs` | Every merge | Repair | Live check on the new deployment, rollback on failure (reuse `lib/supervisor/adapters/vercel-snapshot-host.ts`). |
| `platform-harness/acceptance/production-canary.ts` | Cron every minute | Repair | Add one COS and one Builder check. |
| `lib/supervisor/policy-engine.ts` | Self-Healing | Repair | Trusts a plan's own risk labels; fix inside Self-Healing (not on the customer-task path). |
| `lib/agent-runtime/workflow-store*.ts` (`agent_workflows`) | None | Out of scope | Agent Operations portable; no production writer, no objective column, table not observed live. |
| `lib/supervisor/missions/*` (`mission_records`) | Read-only review routes | Out of scope | Self-Healing domain; nothing creates missions. |

## Integration plan

**Customer Task Record = `builder_jobs`, extended.**

| Required field | Existing | Change |
|---|---|---|
| `immutable_objective` | `objective` | Database trigger rejecting updates |
| `customer_identity` | `user_id`, `conversation_id` | None |
| `execution_id` | `id`, `claim_generation` | COS turns get a row; `turnId` = `id` |
| `current_plan_version` | — | New column; replans bump it |
| `authorized_capabilities` | Harness manifest (in memory) | Store the snapshot at admission |
| `budget` | `builder_inference_budgets` | Every task gets one |
| `completed_actions_ledger` | — | New `task_external_actions` table (phase 2) |
| `evidence_store` | `result`, acceptance ledger | Typed evidence list |
| `final_verification_result` | `status` + `result` | Set only by the verifier |

**Phase 1 — one task, one truth.** (1) Remove the unused `lib/agentic` modules (done 2026-10-29) and `taskLifecycle.ts`. (2) Extend `builder_jobs` with a COS-turn kind, the objective trigger and the plan version. (3) `cos-browser` opens or attaches the record before any lane; every COS turn becomes durable via `durableCosTurn.ts`. (4) The intent judge writes kind, permission and deliverables into the record; delete the regex contracts. (5) History and polling stop expiring checkpointed jobs; recovery belongs to the cron.

**Phase 2 — policy and side effects.** (6) Server-side approval flow for owner-approved Hub actions; verified ads approvers. (7) One spend ceiling for every task on `reserve_builder_inference`. (8) `task_external_actions`: a row with an idempotency key before the provider call, the outcome after; email, social, ads, deploy and PR merge write through it; a reconciler checks `pending` rows against the provider. (9) Pin PR merges to the checked commit; schedule the merge-watch cron.

**Phase 3 — verify, replan, recover.** (10) One verifier for customer tasks on `outcome-verifier.ts`: each recorded deliverable checked against evidence (Builder host proof; for COS a separate verifier call the writer cannot override). Only the verifier sets `final_verification_result`. (11) Incomplete → the orchestrator gets the missing items and new evidence, bumps the plan version, retries within the same budget and grants. (12) Repair replan writes a plan revision, not a new objective.

**Phase 4 — customer controls and release.** (13) History with task status; Stop calls the server cancel for COS and Builder; Resume for paused or recoverable tasks; Results with tests, PR and preview links; 11 languages. (14) Staging environment with the app schema, running the acceptance tests below. (15) Promotion runs one live COS and one live Builder check on the new deployment and rolls back automatically on failure. (16) Branch protection on `main` with the required checks.

## Acceptance tests for the 10 gates

Each gate passes only when its test passes against a running deployment (staging, then the production canary). Each test is written in the same change as the phase that makes it pass. The pending items in `saas/tests/hybridOrchestrationAcceptance.node.test.ts` track them.

| Gate | Test | Passes when |
|---|---|---|
| 1 | `taskRecordIdentity.live.spec.ts` | Turn and the Builder job it starts share one record id; a direct update of `objective` is rejected by the database; History shows one task |
| 2 | `componentDecisions.node.test.ts` | No module marked Remove is referenced; no new task store appears without a row in this document |
| 3 | `policyFloor.node.test.ts` + `.live.spec.ts` | Non-owner approval claim, prompt-driven budget overrun and an ungranted tool are all refused by host code and recorded on the task |
| 4 | `externalActionLedger.live.spec.ts` | Worker killed after the provider accepts an email: exactly one delivered; the ledger row reconciles `pending → confirmed` without resending |
| 5 | `replanImmutableObjective.node.test.ts` | Plan version increases; objective, grants and budget unchanged |
| 6 | `independentVerifier.live.spec.ts` | A Builder run claiming success with a failing test, and a COS answer missing a requested deliverable, are both not complete; the verifier names the gap |
| 7 | `recovery.live.spec.ts` | Reload mid-turn and mid-job re-attaches without re-sending; worker restart resumes from checkpoint; no duplicate action or message |
| 8 | `taskControls.live.spec.ts` | Stop halts server work; Resume continues; Results show tests, PR and preview links (English and Arabic) |
| 9 | `.github/workflows/staging-acceptance.yml` | Gates 1, 3, 4, 6, 7, 8 green against staging before merge |
| 10 | `promoteWithRollback.live.spec.ts` | A broken build fails the live check; production stays on the previous deployment; the rollback is recorded |
