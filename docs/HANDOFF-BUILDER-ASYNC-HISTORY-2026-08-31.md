# Builder Async Jobs and Durable History Recovery

**Date:** 2026-08-31  
**Status:** Production-accepted for the authenticated one-file debug lane and asynchronous durable-History recovery  
**Accepted deployment:** `dpl_F22cDaDNCvTrWMGiHfFPSARRFDXh`  
**Accepted implementation:** `901f47c8a034f92de8edd7e472e065381eb2aa09`

Full runtime evidence: `docs/HANDOFF-BUILDER-VISUAL-PRODUCTION-ACCEPTANCE-2026-08-31.md`.

## Production evidence that motivated the change

A real authenticated Builder request reached the server and isolated sandbox, but the Assistant page stopped waiting before it received a terminal response. The existing recovery path then had two weaknesses:

1. `/api/builder` performed the complete list/read/run/edit/rerun loop inside one browser POST.
2. Assistant message pairs could share the same `created_at`, while History ordered only by that timestamp. A persisted assistant result could therefore be returned before its matching user message, making `findRecoveredAssistantReply` miss it.

Live Production evidence before this change showed:

- authenticated `GET /api/assistant/chats` returned HTTP 200;
- owner conversations and messages existed in Production;
- user/assistant rows frequently shared identical timestamps;
- the prior long Builder request had no durable terminal reply before the page deadline.

Therefore the primary defect was not a missing login or absent History table. It was a synchronous action contract plus nondeterministic History ordering.

## New contract

```text
Assistant sends one POST /api/builder
→ server validates auth, objective, files, conversation and workspace
→ server creates/stages workspace
→ atomic enqueue RPC writes:
     user message
     assistant "running" message
     queued builder_jobs row linked to that assistant message
→ POST returns 202 { jobId, workspaceId, status }
→ Next.js after() claims and runs the job once
→ UI polls GET /api/builder?jobId=...
→ terminal worker updates the same assistant History row to succeeded/failed
→ if the background invocation disappears, the six-minute execution lease expires
→ the next status or History read atomically records builder_job_worker_lost as terminal failure
```

Invariants:

- the Builder POST is never replayed;
- GET polling is read-only and user-scoped;
- duplicate worker invocation cannot execute a claimed job twice;
- a page abort does not cancel or duplicate the durable job;
- a lost background invocation cannot leave History permanently `running`;
- History contains a running result before the POST returns and a terminal result after completion or lease expiry;
- ordinary COS retains its short recovery window; Builder alone gets approximately 20–30 seconds of History/status polling;
- service-role storage remains behind authenticated server routes, with RLS and no `anon`/`authenticated` table or job-RPC privileges.

## History correction and durable jobs

Migration `20260831174502_builder_jobs_and_history_order.sql`:

- adds a durable `assistant_messages.message_order` sequence and orders transcripts by it;
- backfills all existing rows without deleting or rewriting message content;
- adds service-role-only `builder_jobs`;
- atomically enqueues the user/running-assistant/job records;
- atomically claims queued jobs;
- atomically writes terminal job state and replaces the same running assistant message;
- preserves the exact Builder objective and up to 16,000 characters of terminal History output.

Migration `20260831180318_builder_job_stale_recovery.sql`:

- adds a service-role-only execution-lease reconciliation RPC;
- terminalizes queued/running jobs older than six minutes without retrying or replaying POST;
- updates the linked assistant History row in the same transaction;
- uses `FOR UPDATE SKIP LOCKED` so concurrent status and History reads remain idempotent;
- has fixed `search_path` and no `anon` or `authenticated` execution privilege.

The History API validates conversation UUIDs, reports database errors as HTTP 500 instead of silently treating them as missing, returns stale/missing threads as a truthful HTTP 200 empty transcript, disables caching, orders messages by `message_order`, and reconciles expired Builder jobs before returning History.

## Strict Builder routing

Builder authority requires an explicit executable coding/design action plus concrete source evidence:

- supported source attachment;
- source file/path;
- stack trace;
- code fence;
- programming language tied to a coding action.

The following do not route to Builder:

- `debug` or `timeout` alone;
- pasted Vercel/gate/build logs;
- large Assistant History/chat dumps;
- pay-gap questions;
- model-identity questions;
- sports/football lists;
- ordinary research or explanation prompts.

Pasted operational logs receive deterministic analysis only and never repository/sandbox execution authority at either Builder or public Concierge ingress.

## Fixed attached-file debug protocol

For exactly one small `.js`, `.mjs`, `.cjs`, `.ts`, `.mts`, `.cts`, or `.py` attachment:

```text
1. list files
2. read only the attached source file
3. run exactly one Node/Python command
4. if it fails, request one minimal edit_file control
5. recover malformed control JSON once
6. apply at most one edit
7. rerun the exact same command
8. stop
```

The response records the first exit code and stderr/stack, then the exact verification command and final exit code. Coding jobs receive no cognitive-skill/verified-lesson retrieval and no live search or Knowledge Graph context.

The Assistant source-file boundary exposes source extensions in the native file picker and normalizes browser MIME inconsistencies before the existing file-size and server validation paths run.

## Deterministic regression coverage

Mandatory deployment tests cover:

- History 200/error/stale-thread behavior and deterministic ordering;
- same-timestamp recovery;
- atomic running→terminal History state;
- POST 202 and read-only GET polling;
- no Builder POST replay;
- approximately 20–30 seconds of Builder-only recovery polling;
- strict classifier negatives including pay-gap, model, sports, logs and History dumps;
- attached broken-file routing;
- one-file list/read/fail/edit/same-run/pass protocol;
- one malformed-control recovery only;
- stale worker terminalization through status polling and History;
- source-file picker admission;
- service-role/RLS storage boundaries;
- permanent absence of the temporary Production acceptance endpoint.

## Production database verification

Both migrations are applied. A transactional stale-worker probe exercised enqueue → stale cutoff → terminal job failure → linked History update, then rolled back. Post-probe counts remained at zero Builder jobs and zero probe workspaces. The recovery function has a fixed search path, is not executable by `anon` or `authenticated`, and is executable by `service_role` only.

## Authenticated Production acceptance

The exact accepted Production deployment satisfied all required observations:

1. History and `GET /api/assistant/chats` returned HTTP 200.
2. One `POST /api/builder` returned 202 and immediately persisted the ordered running turn.
3. Attached `broken.js` ran with `node 'broken.js'`, exited 1, and returned the real `ReferenceError: result is not defined` stack.
4. Builder applied exactly one edit.
5. Builder reran the identical command and exited 0.
6. Read-only polling observed completion without replaying POST.
7. The same assistant History row changed from running to terminal without another Send.
8. Reopened History contained both the failing first exit and successful verification exit.
9. `does a pay gap exist?` was excluded by the production Builder classifier and created no Builder job.
10. The isolated acceptance identity and every associated job, conversation, and workspace were deleted; final counts were zero.

## Accepted scope

The authenticated one-file debug lane and asynchronous durable-History recovery are Production-accepted as of 2026-08-31.

This acceptance does not grant blanket approval to every complex repository repair, multi-file autonomous change, deployment, merge, credentialed operation, or consequential external action. Those retain their existing approval, evidence, sandbox, and task-specific acceptance requirements.
