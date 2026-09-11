import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../supabase/migrations/20260911024837_security_repository_incident_cases.sql', import.meta.url), 'utf8')\nconst productionFix = readFileSync(new URL('../supabase/migrations/20260911030200_security_repository_incident_case_sql_expression_fix.sql', import.meta.url), 'utf8')

test('incident cases are derived atomically only from explicit defensive indicators', () => {
  assert.match(migration, /create table if not exists public\.security_repository_incident_cases/)
  assert.match(migration, /observation->>'kind' = 'defensive_indicator'/)
  assert.match(migration, /jsonb_array_length\(incident_indicators\) > 0/)
  assert.match(migration, /on conflict \(engagement_id, repository\) do update/)
  assert.match(migration, /evidence_count = public\.security_repository_incident_cases\.evidence_count \+ 1/)
})

test('case severity escalates deterministically and attribution is not manufactured', () => {
  assert.match(migration, /history_rewrite_observed/)
  assert.match(migration, /permission_boundary_change_observed/)
  assert.match(migration, /branch_protection_change_observed/)
  assert.match(migration, /then 'critical' else 'warning'/)
  assert.doesNotMatch(migration, /actor_identity|attribution_hypotheses|suspected_actor/)
})

test('incident timeline is append-only, evidence-linked and unavailable to browser roles', () => {
  assert.match(migration, /evidence_entry_hash text not null unique/)
  assert.match(migration, /before update or delete on public\.security_repository_incident_case_events/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all on table public\.security_repository_incident_cases from public, anon, authenticated, service_role/)
  assert.match(migration, /revoke all on table public\.security_repository_incident_case_events from public, anon, authenticated, service_role/)
  assert.match(migration, /grant select on table public\.security_repository_incident_cases to service_role/)
  assert.match(migration, /set search_path = ''/)
})
\n\ntest('Production correction uses PostgreSQL expression syntax without schema-qualifying special forms', () => {\n  assert.doesNotMatch(productionFix, /pg_catalog\\.(coalesce|greatest)/)\n  assert.match(productionFix, /coalesce\\(pg_catalog\\.jsonb_agg/)\n  assert.match(productionFix, /last_observed_at = greatest\\(/)\n})\n