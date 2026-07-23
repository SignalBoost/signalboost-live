# Mission 002 Phase 2: durable mission outbox

## Architecture

Mission lifecycle records are written to `mission_records`. The same PostgreSQL transaction inserts a `mission_outbox` event. A `BullMissionPublisher` relays pending rows to BullMQ (`mission.events`); `BullMissionConsumer` delivers events to the existing Mission 001 lifecycle, Policy Engine, Dispatcher, and non-mutating manual-review executor. BullMQ is transport only and never grants authorization, ownership, approval, or execution permission.

## Transaction and replay flow

`mission_create_with_outbox` inserts the mission and outbox row atomically. Any constraint or insertion failure rolls back both records. Events include `eventId`, `correlationId`, `causationId`, `idempotencyKey`, `revision`, and `schemaVersion`. The consumer inserts the idempotency key into `mission_event_inbox` before invoking handlers; a uniqueness conflict is a safe duplicate and handlers are not run.

## Recovery, retries, and DLQ

At worker start and periodically thereafter, `publishPending()` reads `pending` and retryable `failed` rows. Redis job IDs equal event IDs, so re-publishing is idempotent at the transport boundary. A row is marked published only after BullMQ accepts it. Bounded failures increment `retries`; the final failure is retained with its sanitized reason and also sent to `mission.dlq`. Nothing is deleted automatically.

## Diagnostics

`MissionStore.diagnostics()` is read-only and reports pending/oldest/published/failed/retry/queue-depth/duplicate/replay/dead-letter counts. Production implementations obtain these figures from the durable outbox; the in-memory implementation supports deterministic tests.

## Limitations and adapters

This phase deliberately adds no provider mutation, production execution, repair, shell, browser automation, or policy bypass. It requires Supabase migrations and Redis/BullMQ configuration. A future Kafka adapter may implement the publisher/consumer transport contract without altering mission ownership or policy. A future Temporal adapter may orchestrate durable workflow timing, but must retain the same transaction, inbox idempotency, Dispatcher, and approval boundaries.
