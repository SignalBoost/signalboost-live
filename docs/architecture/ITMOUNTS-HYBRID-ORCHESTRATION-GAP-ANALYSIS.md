<!-- docs/architecture/ITMOUNTS-HYBRID-ORCHESTRATION-GAP-ANALYSIS.md -->
# iTMounts Orchestration — Gap Analysis and Integration Plan (canonical)

**This is the single canonical plan** for making COS and Builder V2 one dependable assistant under the iTMounts Formal Engineering Standard. It supersedes `ITMOUNTS-CUSTOMER-TASK-IDENTITY-TRACE.md`, `ITMOUNTS-HYBRID-CALLER-DATAFLOW-TRACE.md` and `ITMOUNTS-LIVE-TASK-STORE-SCHEMA-AUDIT-20261029.md`, which remain as dated evidence only. Change the plan here, in one place; do not start a parallel plan, task store or orchestrator.

Evidence: source audit of `main` at `16ac985` (2026-10-29), every component traced to its production callers (imports from `app/` routes and crons, tests excluded), updated for #5043 and #5044. Not runtime proof: a file existing is not counted as working.

## Owner release-blocking acceptance register — 2026-10-29

**Certification: 0/10.** A gate requires repository, staging and exact-revision runtime evidence; PR merges alone never certify customer outcomes.

1. Canonical identity: admit every COS request including read-only turns once; Builder delegation references the same customer task; keep cos_turn out of Builder scheduling (#5082 open); confirm actual deployed database binding.
2. Component decisions: execute all recorded reuse/integrate/repair/replace decisions; eliminate leftover taskLifecycle and word-count completion rules only after caller inventory and regression.
3. Host policy: COS spending ceilings, ads approvals bound to authenticated identities, consequential Hub changes require server-side owner approval.
4. External actions: record before provider execution with idempotency keys; reconcile uncertain email/social/ads/deploy/merge outcomes without double-send.
5. Replanning: monotonic persisted plan version, unchanged immutable objective, unchanged permission and budget ceiling.
6. Independent outcomes: compare every requested deliverable with evidence including citations; no writer or word-count self-certification.
7. Recovery: browser disconnect, page reload and full worker restart resume one COS/Builder execution without duplicate effects; prove live behavior.
8. Customer controls: server Stop, Resume, History state and verified Results with test/PR/preview links, in 11 languages.
9. Staging: full application-compatible staging schema and deployed app; execute real database/browser/recovery/provider-crash tests before promotion (#5091 only prerequisite).
10. Release: canary with exact deployed revision, automatic rollback and required protected-main CI checks.

**Additional release-blocking defects:** Conversation follow-ups forgetting original constraints; customer-support proactive completion; campaign requests not actually starting campaigns; duplicate History writes; completion decided by the new word rule.

**Delivery order:** fix task identity and scheduling, provision staging, policy/action ledger, verification/replanning/recovery, customer UX defects, staging acceptance, safe production rollout. Evidence is required to change any gate from incomplete.

## Verified status update — 2026-10-29

The original 0/10 findings are a historical baseline, not a current certification. The Builder recovery SQL migrations are installed in the connected primary application-schema Supabase project, and real PostgreSQL recovery and pause/resume checks passed in CI. The production deployment's exact database binding has not been independently confirmed.

GitHub main-protection actively requires three checks: Builder recovery PostgreSQL behavior, ONBOARD/repository scan/main integration token, and PR serialization. Typecheck, unit tests, production build, and Vercel COS release gate are not yet required by ruleset.

**Phase 1 remains incomplete:** COS turns are still persisted in assistant_messages rather than a single shared builder_jobs task identity. The immediate next implementation is owner-scoped, idempotent COS task admission in the existing builder_jobs table, linked to History and persisted intent/permissions/deliverables, with executable acceptance tests. Do not create a second task store.

## Developer queue — audit of 2026-10-29 13:30 (do these first, in order)

Owner-run audit of `main` at `1622f73` plus a live COS conversation. Each item names the defect, the evidence, the required fix and the test that proves it. Fix one item per PR, with an executable test; update this section when an item is done.

**Q1 — COS tasks are counted as Builder work (blocker; introduced by #5075–#5081).** *Done in #5094 except the stale-task cleanup, now Q12.* `cos_turn` rows now live in `builder_jobs` with `status = 'running'`, but Builder queries do not filter by kind:
- `app/api/cron/builder-continuations/route.ts` (active-claims admission count, `.eq('status','running')` with no `job_kind` filter): a running COS task blocks the scheduler from starting or resuming any Builder job, for every user.
- `lib/builder/job-store.ts` `builderSoleResumableJob` (same blind count) and `readBuilderEvidenceJob` (newest row of any kind for a conversation, so it can return a COS task).
- `app/api/assistant/chats/route.ts` `builderExecutions` lists COS tasks as Builder runs.
- `admit_cos_customer_task` inserts a `builder_workspaces` row per COS task, so each one appears in the Developer page workspace list (`lib/builder/workspace-supabase.ts` list query).
- A dead COS task is cleaned up only when its owner opens History (`expireStaleDurableCosTurns` has no cron caller), so one stuck COS action can block the Builder scheduler indefinitely.

Fix: every query that means "Builder work" excludes `job_kind = 'cos_turn'`; COS tasks do not appear as Builder workspaces; the continuation cron also expires stale COS tasks through `finish_cos_customer_task`. Test (real PostgreSQL fixture): with a running `cos_turn` row present, the scheduler still admits a queued Builder job; a stale `cos_turn` row is failed by the cron, not by a History read.

**Q2 — confirm the task-record SQL is live.** `20261029153500`, `20261029161500` and `20261029230000` must be applied to the production database. Without `admit_cos_customer_task`, every COS request that performs an external action now returns `cos_task_admission_unavailable` (fail-closed, #5079). Record the confirmation in *Verified status update*.

**Q3 — follow-up questions lose the conversation (live failure, plan step 4).** Owner conversation 2026-10-29 13:20: a pasted State Department cable on Foreign Service time-in-class, then "is there a legal provision that could allow you to continue working beyond age 65?". COS answered from the general age-discrimination law (ADEA), which does not govern Foreign Service mandatory retirement (22 U.S.C. 4052: retirement at 65, Secretary may retain up to 5 years in the public interest). It repeated the error after the owner said the cable concerns federal employees, and answered "the FAIR Act of 2026" with unrelated search results. Cause: `lib/ai/cos/cosFreshConversationContext.ts` decides whether a follow-up depends on earlier messages with word rules (`dependsOnPriorUserTurn`: pronoun and continuation patterns), and when it does, passes only the previous user message cut to 320 characters. The pasted cable never reaches the lookup or the answer.

Fix: the turn's intent judge (`cosTurnIntent`, which already receives prior user and assistant context) decides which earlier material the current request depends on and returns a standalone restatement of the question for lookups; that material (including a pasted document) is available to the answer step. Delete `dependsOnPriorUserTurn` and the 320-character snippet. When supplied material does not contain the answer to the user's question, the judge must mark outside facts as required, so COS researches the question instead of replying only "the document does not cover this". Test: a five-turn fixture with the same shape (pasted personnel cable, then an unanchored follow-up about working past 65, then "I am a federal employee", then a bill name): the lookup query and answer for turns 2–4 carry the Foreign Service context, and no answer relies on ADEA as governing Foreign Service retirement. Use synthetic text, not the owner's personal message.

**Q4 — citations are not checked against their sources (plan step 10).** Same conversation: the owner supplied a summary of a bill; COS repeated it as fact and cited a credit-reporting page that does not contain it. Answer 1 cited "FSLM 14-01" with no source. The fresh-evidence answer (`lib/ai/cos/freshEvidenceGroundedAnswer.ts`) instructs the model to cite, but nothing verifies a cited `[LIVEn]` sentence against that source's text, and `lib/ai/cos/sourceDigestFallback.ts` releases a list of search results as the answer. Fix: before release, each cited sentence is checked against the cited source's retrieved text by a separate verifier call (not the writer); an unsupported citation is removed and the claim is re-researched or stated as unverified; a statute or regulation named without a supporting source is not released as fact; the search-results list is not a customer answer. Test: a fixture where the writer cites a source that does not contain the claim; the released answer does not carry that citation.

**Q5 — COS must go the extra mile in customer support (owner requirement).** Same conversation: answer 1 ended with "contact HR/PE" and an address, and the owner had to ask four more times to learn whether any route existed. The owner's standard: in customer support COS goes the extra mile, owning the person's underlying goal, not only the literal question. Required behaviour, unasked: (1) answer the question; (2) when the answer is "no" or "not in this document", research and give what would work instead: the available routes, who decides, eligibility, deadlines, what to submit and to whom (here: the 22 U.S.C. 4052(b) public-interest extension and the pending bill); (3) flag what the person may not know to ask (risks, deadlines, related options); (4) end with concrete next steps COS can do now (for example, draft the request, check the bill's status, prepare questions for HR) and offer them. A deliverable the person did not ask for (a draft, a rewrite) is offered, not produced, unless the request is plainly for help with that action: the 2026-10-28 unrequested-rewrite failure must not return. Everything volunteered must meet Q4 (verified, cited) and use Q3 (the conversation's context). Test: on the Q3 fixture, answer 1 names the available route with a supported citation, flags at least one relevant deadline or condition, and ends with concrete offered next steps; it contains no unrequested draft. A short follow-up ("what can I do?") must not be needed to get the route.

**Q6 — the owner's campaign request did not start the campaign (live failure, 2026-10-29 16:09 UTC).** The owner pasted the COS-PAC-001 document on the Assistant. No campaign job was created; the request was recorded as an ordinary COS task (`builder_jobs` `3270e580…`, `job_kind = cos_turn`, `succeeded`) and answered by `cos-completion-first-rescue` with a false capability denial: "I cannot execute the Production Acceptance Campaign … I do not have direct access to … browser automation tools (Playwright)". Verified facts: `namesVerificationCampaign` matches the document (`tests/fixtures/cos-production-acceptance-campaign.txt`); the document is also classified as an external action, so it goes through the durable path (`app/api/cos-provenance-browser/route.ts` → `after()` → `cos-browser`), where the campaign start in `cos-browser` requires `authenticatedOwner` from `getAccess()`. The campaign start was not reached or not admitted on that path; the exact reason needs the runtime log or a test of that path. Fix: a request naming the campaign identifier from the signed-in owner starts the campaign on every path, including the durable one, before any COS answer is produced; COS never answers with a capability it actually has denied. Test: drive the fixture through `cos-provenance-browser` with an owner session and assert one campaign job (`metadata.builderEngine = campaign`) and the campaign start reply; on failure, an honest error, never "I cannot execute". *Status 2026-10-29 (#5116): the signed-in owner's request naming the campaign is no longer queued as a background turn; it runs on the request path, where `cos-browser` starts the campaign job before any answer exists. Live confirmation (owner pastes the document, gets the campaign start reply and job id) is outstanding. A campaign request that does not carry the identifier still depends on the planner inside the background worker.*

**Q7 — History duplicates and internal text (live, 2026-10-29).** The owner's database shows each user message and reply stored twice about one second apart (16:19:35/16:19:36 and two rows at 16:21:38 UTC), and an internal lookup string ("Previous user context: … Current follow-up question: …") stored as a `role = user` message. History must store each turn once, and only the person's own words as user messages. Test: one request through the Assistant path produces exactly one user row and one assistant row, with the user row equal to the typed text.

**Q8 — no new word rules.** `pastedConversationEvidence` in `app/api/cos-browser/route.ts` (#5035) decides routing by matching text such as "YOUR REQUEST 1" / "COS response 1". The owner forbids deciding behaviour from wording; this belongs to the intent judge (Q3). Remove it when Q3 lands, and do not add others.

### Owner audit of 2026-10-29 17:11 (`main` at `b3982ec`) — next, in this order

**Q9 — Q6 is not fixed; remove the new word rule.** *Done in #5114/#5116: the owner campaign request now starts COS-PAC-001 (live run 2026-10-29 20:44 UTC).* #5090 added `refusedRequestedExecution` (`lib/ai/cos/cosExecutionVerdict.ts`, used in `app/api/cos-provenance-browser/route.ts`), which marks a task failed when the reply starts with "I cannot execute…". That decides by wording (forbidden; see Q8), and the owner's campaign request still does not start the campaign: the refusal is only recorded as a failure. Fix Q6 itself, so that the campaign request from the signed-in owner starts the campaign on the durable path. Determine the task outcome from what was executed (a campaign job created, a Builder job admitted, an answer released), never from reply wording. Then delete `refusedRequestedExecution` and its test. Test: the Q6 fixture creates exactly one campaign job and its task is `succeeded` because the job exists.

**Q10 — replace the word-count completion check; do not tighten it.** #5104 (`releasableAnalyticalAnswer`: `if (missing.length) return false`) now withholds the whole answer when the word-count heuristic judges any requested section thin. That is the rule Q4 and the plan mark for replacement, and the register says to eliminate it. Tightening it withholds more real answers, and the campaign's analysis checks (PAC-01 to PAC-05, PAC-11, PAC-20) still grade with the same heuristic, so their verdicts stay unreliable. Build the independent verifier from Q4 (a separate call that compares each requested deliverable and each cited claim against evidence). Use it both to release COS answers and to grade the campaign, then remove `missingAnalyticalTasks` / `releasableAnalyticalAnswer` from the release decision. Test: an answer whose sections are short but complete is released; an answer missing one requested deliverable is not; the campaign grader and COS agree because they use the same verifier. *Status 2026-10-29: answer-completion part built. `lib/ai/cos/answerOutcomeVerifier.ts` is the one verifier: a separate judge call quotes the passage delivering each requested deliverable, and the host accepts it only when the quote is in the answer and not copied from the request; an unavailable judge gives `unverified`, which releases. It decides the reasoner's answer loop and final release, the completion-first rescue lane, and the campaign's analysis and fault grading (ungradable = BLOCKED). `releasableAnalyticalAnswer` (with #5104's gate) and `evaluateTaskOutcome` are deleted; `missingAnalyticalTasks` only steers repair drafts. Citation checking against sources (Q4's second half) is not built yet.*

**Q11 — no dead code.** *Done in #5114: the function is deleted.* `advanceBuilderRepairPlanVersion` (`lib/builder/job-store.ts`, #5100) has no caller. Either wire it into the replan path with its version-conflict test, or delete it in the same PR.

**Q12 — stale COS tasks are cleaned only when History is read.** *Done in #5121: `/api/cron/cos-stale-turns` runs the cleanup for all users.* `expireStaleDurableCosTurns` is still called only from `app/api/assistant/chats/route.ts`. A COS task whose worker died stays `running` until its owner opens History. Call it from the continuation cron for all users, through `finish_cos_customer_task`. Test (PostgreSQL fixture): a stale `cos_turn` row is failed by the cron with History updated, and a row finished concurrently is not overwritten.

**Q13 — a one-question COS answer takes 41 s.** Owner test 2026-10-29 17:38 (America/Asuncion), trace `a216c98eb67a536e65bf28e3a14e74e5` in `provider_inference_usage`: a pasted cable plus one question. Measured steps:
- 0–10 s: the turn-intent judge (`semantic_task_intent`). The owned reasoner (`qwen3:30b`) ran to its 8 s deadline and failed (`timeout:inference_transport_deadline`); the managed backup (`Qwen/Qwen3.6-35B-A3B`) answered in 4.6 s. The same judge answered in 2.4 s at 17:44, so the slow call is intermittent. The judge blocks every turn, so its worst case is every turn's floor.
- 10–23 s: no model call is recorded for 13 s. What runs there (retrieval, web lookup, context assembly) is not visible in any trace. Not yet diagnosed.
- 23–41 s: three sequential `agent_tool_loop` calls on `deepseek-ai/DeepSeek-V4-Flash-0731` (4.1 s, 2.2 s, 10.2 s).

Fix, in order:
1. Record every non-model step of a turn (lookups, retrieval, context assembly) with its duration under the same trace id, so the 13 s gap is attributable without new dashboard sections. Then remove the cause the record shows.
2. Bound the intent judge: it must not cost more than a few seconds when the owned reasoner is slow. Either start the backup much earlier for this call or run the judge alongside the first evidence step instead of before it. Do not add a new configuration variable.
3. Test: a fixture where the owned reasoner stalls still yields a judge reading within the bound; a fixture turn records a duration for every step. Live acceptance: the same owner question answered in 15 s or less end to end, with the trace showing each step.

Also seen: trace `20167074133a69799f6181580da37103` (17:44) — `public_self_disclosure` failed on `timeout:inference_owner_deadline` after 1.5 s. Check what the user received on that turn.

**Q14 — fix what the 2026-10-29 20:44 UTC campaign run found (11 PASS, 3 FAIL, 6 BLOCKED; production `02c869f`).**
1. *No answer released (PAC-03, PAC-20).* Both analytical requests ended `failed_closed` with nothing shown to the user (30.4 s and 27.0 s). The stage that closed them is not in the report. Find it from the turn's trace and fix it so an analytical request always reaches a released answer or a stated, specific failure. PAC-20 stopped at request 3 of 20.
2. *Campaign requests leave no trace (PAC-16, PAC-17 blocked).* Every result shows `Correlation: —` and the campaign found 0 turn records, although `provider_inference_usage` recorded 39 calls in the same window. Each campaign request must carry its turn and correlation id and write its turn record, so PAC-16 and PAC-17 can be judged.
3. *Production changed during the run (PAC-09, PAC-10 blocked).* #5118 and #5121 deployed while the campaign ran (`9c2f04c`, `ea1b544`), so the fault checks refused to certify. Do not merge to `main` while a campaign runs, or have the campaign wait until no deploy is in flight before it starts.
4. *PAC-11 does not test what it claims.* It submitted the normal payment prompt and passed because an answer was released. It must feed known-bad answers (incomplete, duplicated sections, generic text under different headings) to the release check and pass only when each is rejected and a good answer is released. Grade with the Q10 verifier, not the word-count heuristic.
5. *Passes that hide a failure.* PAC-01, PAC-02 and PAC-11 were answered by the rescue path (`cos-completion-first-rescue`) after 83–90 s; the primary path did not answer first. Record which path answered and why the primary failed; together with Q13 this is the latency fix.
6. *PAC-13 used the public Concierge*, not an authenticated COS conversation as section 7 of the campaign requires. Run it on the test account once the owner provides one (also unblocks PAC-14, PAC-15).
7. *PAC-19: `public-smoke` (`.github/workflows/itmounts-launch-smoke.yml`) has failed on all of its last 100 runs, the oldest on 2026-10-28 13:25 UTC.* Its log is not readable from the audit session. Read the failing step's output, fix the cause (site or check), and add it to the required checks once green.

**Also confirm live:** migrations `20261029233500_builder_repair_plan_atomic_admission.sql` and `20261029235900_builder_customer_task_parent_link.sql` (in addition to Q2), recorded in *Verified status update*.

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
