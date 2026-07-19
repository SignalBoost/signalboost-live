import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('audit dashboard exposes one global approval and no per-finding patch approval control', () => {
  const dashboard = read('../app/dashboard/audit/page.tsx')
  assert.match(dashboard, /approveAllFixes/)
  assert.match(dashboard, /Approve all fixes/)
  assert.match(dashboard, /\/api\/hub\/operator\/audit\/approve-all/)
  assert.doesNotMatch(dashboard, /import PatchPreview/)
  assert.doesNotMatch(dashboard, /<PatchPreview/)
})

test('global approval is scoped to a valid current run and prevents duplicate approval', () => {
  const route = read('../app/api/hub/operator/audit/approve-all/route.ts')
  const migration = read('../supabase/migrations/20260719_audit_run_global_approval.sql')
  assert.match(route, /isUuid\(body\.runId\)/)
  assert.match(route, /approve_audit_run_remediation/)
  assert.match(route, /already_approved/)
  assert.match(migration, /where id = p_run_id and status = 'complete'/)
  assert.match(migration, /unique \(run_id\)/)
})

test('approval event includes the required immutable audit fields and rollback marker', () => {
  const migration = read('../supabase/migrations/20260719_audit_run_global_approval.sql')
  for (const field of ['runId', 'approvedBy', 'findingsFixed', 'status', 'timestamp']) assert.match(migration, new RegExp(`'${field}'`))
  assert.match(migration, /'approved'/)
  assert.match(migration, /rollbackEntryPoint/)
  assert.match(migration, /'thin'/)
})

test('approved batch marks only the selected run findings as fixed in the same RPC transaction', () => {
  const migration = read('../supabase/migrations/20260719_audit_remediation_findings_approval.sql')
  assert.match(migration, /add column if not exists fixed boolean not null default false/)
  assert.match(migration, /set fixed = true,\s*fixed_at = v_timestamp/)
  assert.match(migration, /where run_id = p_run_id;\s*get diagnostics v_count = row_count;/)
})

test('schema drift fails closed with an actionable migration response', () => {
  const route = read('../app/api/hub/operator/audit/approve-all/route.ts')
  assert.match(route, /audit_approval_schema_not_ready/)
  assert.match(route, /column \"approved\" of relation \"audit_runs\" does not exist/)
  assert.match(route, /requiredMigrations: REQUIRED_MIGRATIONS/)
  assert.match(route, /status: 503/)
  assert.doesNotMatch(route, /error: approval\.error\.message/)
})

test('repair migration replaces the stale approved-column RPC with canonical status approval', () => {
  const migration = read('../supabase/migrations/20260719_repair_audit_approval_schema_drift.sql')
  assert.match(migration, /create or replace function public\.approve_audit_run_remediation/)
  assert.match(migration, /set status = 'approved'/)
  assert.match(migration, /where id = p_run_id and status = 'complete'/)
  assert.doesNotMatch(migration, /set approved\s*=/)
  assert.match(migration, /grant execute on function public\.approve_audit_run_remediation\(uuid, uuid\) to service_role/)
})
