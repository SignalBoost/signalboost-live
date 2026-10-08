# Phase 3 deployed database verification — 2026-10-08

Status: partial verification, NOT end-to-end certified.

Source revision: c52c208064ef8fbef0c6ebc5e7149940bec57fc3. Target: existing production Supabase project (reference redacted in this report).

Observed before repair: 11 Lab tables with RLS and no anon/authenticated SELECT. Missing research_consents, provider_grants and provider_human_approvals. Applied the already-merged migrations 20261008033500, 20261008114600 and 20261008120000 in that order through the deployment connection; all returned success. The read-only lab-phase3-access-boundary-acceptance.sql completed without exception afterward. No grants or approvals were issued and no providers invoked.

Observed records afterward: organizations=0, active organization members=0, provider grants=0, human approvals=0, research consents=0. No real tenant identity or credential isolation claim is possible from this deployment yet.

Local exact-source regression: 38 tests before repair, 35 passed and 3 failed. Root cause: labTenantProviderGrantGuard UUID regex omitted the fourth UUID group, rejecting canonical IDs. Correcting it and adding a truncated-UUID negative regression yielded 39/39 passing across eight suites (BYOI scope/execution, privacy policy/execution, provider grant guard, Harness preflight, governed execution and one-use approval).

Outstanding: authenticated two-tenant API/storage/export/log/telemetry adversarial proof; all real egress integrations; host/vault and provider adapter wiring including authorized one-use redemption; two isolated test credential sets and actual provider receipts; deployed buyer-owned engine and snapshot/restore/rollback drill; independent review with exact-revision evidence. Disposable-only SQL fixtures were not run against production. Do not substitute local fixtures, migration success or green CI for those outcomes.
