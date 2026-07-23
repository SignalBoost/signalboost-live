# Mission 002 Phase 6: Manual-review inspection API

Phase 6 adds two **inspection-only** internal Supervisor endpoints. They do not approve, resolve, retry, replay, cancel, dispatch, or otherwise execute a manual-review record. Production execution remains disabled.

## Routes

- `GET /api/internal/supervisor/missions/reviews` lists routed manual-review records.
- `GET /api/internal/supervisor/missions/reviews/[reviewId]` returns one routed manual-review record.

Both routes use the existing internal Supervisor `requireAdmin` guard. An unauthenticated caller receives `401`; a signed-in caller without owner/admin authorization receives `403`. The existing guard supplies the server-only Supabase client because Mission 002 tables have RLS enabled and deny direct authenticated-table access. No service-role key is returned to the caller.

Mission 002 mission records currently have no tenant or organization column. Consequently, authorization is owner/admin-only rather than tenant-filtered. If tenant scope is added to Mission records, both read paths must add the same tenant predicate before returning a review or its mission summary. A detail lookup returns `404` for a missing, malformed, or out-of-scope record so it cannot disclose record existence.

## Pagination and filters

The list route accepts optional `status`, `missionId`, `limit`, and `cursor` parameters. `status` currently accepts only `routed`; mission IDs must use the bounded canonical identifier character set. `limit` defaults to `25`, must be a positive integer, and cannot exceed `100`.

Results are ordered deterministically by `created_at DESC, review_id DESC`. The opaque cursor encodes only the final record's timestamp and review ID; the following page uses a strict tuple comparison rather than offset pagination. Malformed filters, limits, and cursors return a bounded `400` error.

## Sanitized response fields

List items contain only review ID, mission ID, mission revision, decision ID, status, title, summary, created timestamp, routed timestamp, and schema version. List items intentionally exclude all fingerprints.

Detail adds the decision, plan, and binding fingerprints. It can also include a bounded allowlisted mission summary (identity, lifecycle, environment, title, risk level, timestamps, and schema version) when the mission remains available. There is no safely available durable execution-feedback ledger in Phase 6, so the detail response does not invent or expose execution feedback.

Neither response exposes raw prompts, chain-of-thought, credentials, tokens, cookies, authorization headers, Redis URLs, stack traces, arbitrary metadata, mission objectives, or provider payloads. The routes export only `GET`; they call no mutation RPC and add no write API.
