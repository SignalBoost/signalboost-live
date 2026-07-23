# Mission 002 Phase 3: governed worker runtime

## Safety posture

Mission workers are disabled by default. Enabling `MISSION_WORKERS_ENABLED=true` additionally requires an explicit publisher or consumer flag and `MISSION_REDIS_URL`; configuration validation rejects unsafe numeric values and never logs the URL. A production composition must inject durable Supabase and BullMQ ports; this foundational runtime deliberately does not provide an in-memory production factory.

The sole terminal action remains `manual_review_routed`. BullMQ is transport only: it cannot authorize execution. `blocked` and `approval_required` decisions never reach the approved topic or executor. The executor must revalidate the current mission revision immediately before recording the durable manual-review route; provider, GitHub, CI, browser, shell, deployment, and production actions remain disabled.

## Runtime and recovery

`saas/lib/supervisor/missions/runtime.ts` is an explicit dependency-injected runtime contract. Importing it performs no network work. `start()` and `stop()` are idempotent. A single non-overlapping, bounded polling iteration obtains/renews a lease, performs bounded recovery, then invokes injected publication only while the current fenced lease is valid. Stop clears scheduling, waits for the active iteration, stops the consumer, and releases the lease.

The migration adds `claimed` and `retry_wait` states, claim owner/fence/timestamps, retry timestamp, and `mission_claim_outbox`. Claiming uses `FOR UPDATE SKIP LOCKED` within the RPC and validates the current lease using database time. Stale claims may be reclaimed after expiry; published and dead-lettered rows are excluded. Dead-letter rows are inspection-only and are never automatically replayed.

## Diagnostics and activation

The typed runtime health report exposes queue/outbox counts, owner/fence expiry, duplicate/recovery counts and deterministic `disabled`, `healthy`, `warning`, or `critical` status. No diagnostic payload includes raw event data, connection URLs, credentials, cookies, headers, stack traces, or prompts.

Activation is an operator decision after applying the migration and supplying server-only Supabase and Redis configuration. A separately reviewed adapter must compose the injected ports into externally managed publisher/consumer processes; no web deployment starts them automatically. Roll back by setting `MISSION_WORKERS_ENABLED=false`, stopping worker processes, and retaining outbox/dead-letter rows for inspection. Do not delete or replay records automatically.

## Known limitations

This repository does not include a local Supabase service harness, so database RLS/RPC behavior must be exercised in the deployment pipeline with a service-role test environment. The migration revokes client access and grants the claim RPC only to `service_role`; it does not broaden RLS.
