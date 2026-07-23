# Mission 002 Phase 7: manual-review operator UI

## Route and access

The read-only operator page is `/dashboard/supervisor/missions/reviews`, following the existing Supervisor dashboard route convention. It requires the same signed-in admin/owner check as other Supervisor pages: unauthenticated users are redirected to `/login`, while authenticated non-admin users receive an access-denied page. The browser calls only the Phase 6 GET inspection endpoints; it does not query Supabase directly or receive credentials, cookies, or authorization headers.

## Inspection surface

The list displays the allowlisted review ID, mission ID and revision, decision ID, status, title, summary, created time, and routed time. It supports the routed-status filter, bounded mission-ID filter, page-size selection (25 by default; 100 maximum), and deterministic cursor previous/next pagination.

Selecting a table row fetches a read-only detail panel. It repeats the list fields and adds safe-copy, monospace decision, plan, and binding fingerprints. It renders only the bounded mission summary returned by Phase 6. The current API has no durable execution-feedback summary, so the UI explicitly states that it is unavailable rather than inventing one.

## Read-only boundary and limitations

The page visibly states: “Manual review only,” “No repair has been executed,” “Production execution disabled,” and “Provider mutation disabled.” It has no approval, retry, replay, repair, provider, CI, GitHub, or other mutation controls. The UI does not assert that an underlying CI failure has been fixed. Phase 6 has only one supported review status (`routed`) and does not provide execution feedback; no mutations, migrations, RPCs, workflows, workers, or production execution were added.
