<!-- docs/architecture/ITMOUNTS-LIVE-TASK-STORE-SCHEMA-AUDIT-20261029.md -->
# Live database inventory — canonical customer task authority decision

> **Superseded 2026-10-29 by [`ITMOUNTS-HYBRID-ORCHESTRATION-GAP-ANALYSIS.md`](ITMOUNTS-HYBRID-ORCHESTRATION-GAP-ANALYSIS.md), the single canonical plan.** Kept as dated evidence only; do not plan from this file.

Audit date: October 29, 2026. GitHub main `b947c733cfe626beec57c9a047b527a51a184132`. **Read-only queries** through connected Supabase project inventory and information_schema. No database writes or migrations applied.

## Discovered projects and observed schema

- **SignalBoost's Project**, ref `qpblefwtnbivuusxmabv` (US-West): contains `public.assistant_conversations`, `public.assistant_messages`, and `public.builder_jobs`. This is the only inspected project with the observed combined COS and Builder schema; production app binding has **not** been independently confirmed. Treat it as the main application schema *candidate*, not as a verified current environment target.
- **itmounts-staging**, ref `ezpyphjofgpkwodzoipm` (US-East): observed `public.agentic_workflow_checkpoint`, but no `assistant_conversations`, `assistant_messages`, `builder_jobs`, or `agent_workflows` table in the query results. This staging project **cannot** yet serve as equivalent end-to-end COS + Builder staging environment.
- **itmounts-eu-production**, ref `bzjxijpbbtlbsqlkhrfx` (EU): observed `eu_builder_workspaces` and `eu_builder_workspace_files` rather than the combined application task schema. Do not confuse this regional project with the owner-facing app database.
- The proposed `agent_workflows`, `agentic_workflow_definitions`, and `agentic_workflow_runs` tables were not observed by these read-only table inventories. Recheck migrations and deployment DB binding before assuming that source code is operational.

## File-to-table mapping and decisions

| Source / tables | Confirmed code and schema | Decision |
|---|---|---|
| `saas/lib/ai/cos/durableCosTurn.ts` → `assistant_conversations`, `assistant_messages` | Conversation/message rows exist, `assistant_messages.provenance` jsonb stores `turnId`; `assistant_conversations` carries owner ID, title and summary. | **REUSE** and extend owner-scoped mapping to task; not yet canonical task truth |
| `saas/lib/builder/job-runner.ts`, `job-store.ts` → `builder_jobs` | `builder_jobs` has `id`, `user_id`, `conversation_id`, `objective`, `status`, `checkpoint`, `claim_generation`, `metadata`, `result`, `history_message_id`. | **REUSE** durable Builder lifecycle; exact conversation and message links are existing bridge |
| `saas/lib/agent-runtime/workflow-state.ts`, `workflow-store-supabase.ts` | Rich type with `workflowId`, owner ID, idempotency, lease, version; corresponding `agent_workflows` table not found in inspected databases. | **HOLD as canonical authority candidate** until active callers and migration verified; types alone do not establish a live store |
| `saas/lib/agentic/dynamicWorkflowRunStore.ts` | CAS checkpoint code exists, staging inventory shows one differently named `agentic_workflow_checkpoint` table; runtime deployment and exact binding unproven. | **CONSOLIDATE**, never create a parallel customer-task authority **Removed 2026-10-29: no production caller.** |
| `saas/app/api/assistant/chats/route.ts` | Conversation/message GET with owner scoping; stale Builder and COS turn reconciliation | **REUSE + INTEGRATE** for customer visibility |

## Concrete finding: an existing link to preserve

`public.builder_jobs.conversation_id` and `public.builder_jobs.history_message_id` exist; the Builder may already attach its child execution to the same conversation and message record COS exposes. However, `conversation_id` identifies a **conversation**, not a unique customer task. Multiple requests can share a conversation. Therefore it is not sufficient to claim canonical task identity or exactly-once execution.

**No existing system is yet approved as the sole canonical customer-task authority.** Do not introduce a new table merely to resolve uncertainty. First determine actual deploy-time project bindings and enumerate existing tables, migrations and callers for `workflow-state`. The preferred near-term integration uses existing Builder `conversation_id` / `history_message_id` to join visible History while retaining independent Builder checkpoint and COS durable-turn semantics. A stable one-task-to-many-child-execution mapping and immutable objective/acceptance contract still require design and verification.

## Required next test implementation — staging, non-destructive

1. Verify the exact deployed Supabase project reference for each `/api/cos-browser`, `/api/builder` and `/api/assistant/chats` route **without exposing secrets**. Fail if different stores are used without an explicit cross-region ownership contract.
2. Read-only staging fixture: create a COS task using approved test account and accepted request, then inspect corresponding History row, Builder child job, any `workflowId` and immutable objective. Assert one stable task ID with owner scoping. This fixture cannot yet run against the current staging schema as inventoried.
3. Validate idempotent replay across loss of POST response, crash after external action, and concurrent duplicate submission **in a provider sandbox**. Check provider receipt, not only SQL row count.
4. Verify each path uses independently enforced host grants and that cancellation and plan revision preserve original objective and budget.
5. Retain all **0/10 commercial gates unverified** until staging runtime evidence, independent outcome verification, and production rollout exist.

## Release blockers

- No confirmed canonical customer task authority.
- The observed staging schema lacks COS/Builder parity; staging cannot substantiate the proposed end-to-end acceptance test without further configuration.
- Existing agent-runtime types and code are not proof of deployed tables or active callers.
- Stop/Resume, per-operation reconciliation and verifier-controlled customer-success closure have not been proved across the full task lifecycle.

This is an **audit and decision**, not a runtime repair or production rollout. No new orchestration abstractions authorized.
