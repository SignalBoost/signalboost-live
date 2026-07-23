# Mission 002 Phase 8: manual-review diagnostics

Phase 8 adds a compact, read-only summary for durable Mission 002 manual-review records. It does not add a workflow action, mutation, worker, queue, provider call, or production execution path.

## Endpoint and authentication

`GET /api/internal/supervisor/missions/reviews/diagnostics` uses the same `requireAdmin` guard as the Phase 6 inspection routes. Unauthenticated callers receive `401`; authenticated callers without admin/owner access receive `403`. The server-only Supabase client is retained on the server, and the response contains only the allowlisted fields below.

## Response and status rules

The response contains `generatedAt`, `total`, `routed`, optional `oldestRoutedAt`, optional `newestRoutedAt`, optional `duplicateRoutesPrevented`, and `status`. Counts are non-negative integers and timestamps are ISO timestamps.

- `empty`: `total` is zero.
- `warning`: routed records exist and `newestRoutedAt` is older than seven days than `generatedAt`.
- `healthy`: every other valid response.

The Supabase store uses exact count queries plus one bounded oldest and newest routed-record query. It never retrieves all review rows into application memory and never returns raw review records. The current durable schema has no duplicate-prevention counter, so `duplicateRoutesPrevented` is omitted unless a future store can provide it safely.

## Operator UI and limitations

`/dashboard/supervisor/missions/reviews` fetches the endpoint with GET and parses JSON from `unknown` with an explicit allowlist. Invalid timestamps, non-integer or negative counts, unknown statuses, and unexpected primitive types are rejected. The summary displays total/routed counts, routed timestamps, duplicate prevention when available, and status. It retains the existing “Manual review only,” “No repair has been executed,” “Production execution disabled,” and “Provider mutation disabled” labels.

The diagnostics section contains no action buttons. This remains inspection-only: no approve, reject, resolve, cancel, retry, replay, delete, edit, repair, provider mutation, GitHub write, CI trigger, or production execution API exists. Production execution remains disabled.
