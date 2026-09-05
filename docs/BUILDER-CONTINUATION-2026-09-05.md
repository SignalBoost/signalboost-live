# Builder continuation and repair verification

Standard isolated Builder jobs can save progress between completed tools and continue in a fresh invocation. This removes the single-invocation wall-clock limit for that lane; it does not certify general autonomous model reliability.

The original job, workspace, objective and History message stay fixed. A private version-1 checkpoint retains the original file set, project context, latest successful source, ordered tool evidence, duplicate-call guards and cumulative work counters. A SHA-256 content snapshot detects workspace changes before resuming. No model reasoning transcript is stored. Polling and evidence lookups do not return checkpoint payloads or execute work.

The worker stops starting new model rounds after 130 seconds and checks again before starting a tool at 180 seconds. A provider deadline can also produce a checkpoint because model generation itself executes no tools. A protected minute cron selects at most three paused jobs; each must atomically claim its next generation. Completion and checkpoint writes require that same generation, so an earlier worker cannot overwrite a later claim. Jobs get at most four invocations; existing total work/write/run limits still apply. Closing the chat does not stop scheduled continuation. History remains the durable result surface.

The continuation lane excludes attachment-debug and owner repository-repair jobs. An abruptly lost worker is terminalized without replay, retaining the preceding checkpoint's public evidence. An external workspace change, oversized checkpoint or exhausted continuation budget also fails explicitly. This does not add dependency installation, repository access, chunked writes or unrestricted run budgets.

## Verification

- `node --test tests/builderCheckpoint.node.test.ts`: real Node execution of an existing broken `add.js`, recorded failed test, source edit, then the identical passing command. Verified both uninterrupted and after JSON serialization into a fresh controller. Generation decisions are scripted.
- The same suite verifies continuation of a partially verified new build without rerunning its first proof, original file classification, cumulative limits, repeated-write refusal, scope/content mismatch, late-model response handling and scheduler authority.
- `node scripts/vercel-cos-gates.mjs`: complete mandatory deployment regression gate.
- `node node_modules/typescript/bin/tsc --noEmit --pretty false`: TypeScript verification.
- Production migration `20260905061418_builder_job_checkpoints` applied. `saas/tests/sql/builder-job-checkpoints.sql` ran under `service_role` inside a rolled-back transaction. It verifies ownership, exclusive claims, pause/restore, stale/legacy-worker fencing, four-invocation limit, uncertain-worker refusal, retained evidence, current-generation completion and terminal History. No fixture rows remain. New RPCs deny both browser roles. The advisor's informational RLS-without-policy entry is intentional: Builder job storage is service-role-only.

## Deployment and live acceptance

Exact CI/Preview, merge and Production deployment must be recorded separately from the above controller/database proof. Observe an authorized scheduled request to `/api/cron/builder-continuations` after deployment. A successful empty scheduler tick proves dispatch/authentication, not model repair.

The owner should rerun the existing expense-report request in Concierge. If it crosses a slice boundary, inspect the same job's generation, saved trace and History: it must continue without a second intake request, preserve earlier command evidence and only claim success after all requested proofs pass. An uninterrupted successful job does not by itself accept continuation. Do not fabricate a paused production job or alter lifecycle state to manufacture this evidence.
