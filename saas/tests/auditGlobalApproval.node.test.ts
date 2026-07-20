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

test('owner approval invokes governed remediation and already-approved retries remain valid', () => {
  const route = read('../app/api/hub/operator/audit/approve-all/route.ts')
  assert.match(route, /runApprovedAuditRemediation/)
  assert.match(route, /const alreadyApproved = event\?\.reason === 'already_approved'/)
  assert.match(route, /if \(!event\?\.approved && !alreadyApproved\)/)
  assert.match(route, /code: 'audit_remediation_failed'/)
  assert.match(route, /retryable: true/)
  assert.match(route, /remediation\.findingsApplied \+ remediation\.findingsAlreadyResolved/)
})

test('approved remediation writes only to one ai branch and one pull request', () => {
  const engine = read('../lib/audit/approvedRunRemediation.ts')
  assert.match(engine, /const REPO = 'SignalBoost\/signalboost-live'/)
  assert.match(engine, /const BASE_BRANCH = 'main'/)
  assert.match(engine, /ai\/audit-run-/)
  assert.match(engine, /commitFileToBranch/)
  assert.match(engine, /enablePullRequestAutoMerge/)
  assert.match(engine, /mergeMethod: SQUASH/)
  assert.match(engine, /required repository checks pass/)
  assert.doesNotMatch(engine, /branch:\s*['"]main['"]/)
  assert.doesNotMatch(engine, /refs\/heads\/main/)
})

test('deterministic remediation applies only exact i18n raw JSX text', () => {
  const engine = read('../lib/audit/approvedRunRemediation.ts')
  assert.match(engine, /category\.toLowerCase\(\) === 'i18n-raw-string'/)
  assert.match(engine, /LocalizedText/)
  assert.match(engine, /rawJsxTextPresent/)
  assert.match(engine, /findBadImports/)
  assert.match(engine, /preservedFraction/)
  assert.match(engine, /Only exact i18n raw-text findings are supported/)
  assert.doesNotMatch(engine, /callAuditModel/)
})

test('recovery cron processes only the newest durably approved run', () => {
  const cron = read('../app/api/cron/audit-approved-remediation/route.ts')
  const vercel = read('../vercel.json')
  assert.match(cron, /\.eq\('status', 'approved'\)/)
  assert.match(cron, /\.order\('created_at', \{ ascending: false \}\)/)
  assert.match(cron, /\.limit\(1\)/)
  assert.match(cron, /audit_remediation_approvals/)
  assert.match(cron, /runApprovedAuditRemediation/)
  assert.match(vercel, /"path": "\/api\/cron\/audit-approved-remediation"[\s\S]*?"schedule": "\*\/10 \* \* \* \*"/)
})

test('owner history refresh recovers the newest approved run without changing approval', () => {
  const runs = read('../app/api/hub/operator/audit/runs/route.ts')
  assert.match(runs, /if \(!ctx\.isOwner \|\| !ctx\.userId\)/)
  assert.match(runs, /const newestApproved = \(runs\.data \|\| \[\]\)\.find/)
  assert.match(runs, /run\?\.status === 'approved'/)
  assert.match(runs, /recoverApprovedRun\(admin, String\(newestApproved\.id\), ctx\.userId\)/)
  assert.match(runs, /run\.data\.status === 'approved'/)
  assert.match(runs, /remediation: payloads\.remediation \|\| recovery/)
  assert.doesNotMatch(runs, /approve_audit_run_remediation/)
})

test('transient GitHub remediation failures retry three times across every recovery path', () => {
  const retry = read('../lib/audit/approvedRunRemediationRetry.ts')
  const approval = read('../app/api/hub/operator/audit/approve-all/route.ts')
  const runs = read('../app/api/hub/operator/audit/runs/route.ts')
  const cron = read('../app/api/cron/audit-approved-remediation/route.ts')

  assert.match(retry, /const MAX_ATTEMPTS = 3/)
  assert.match(retry, /const RETRY_DELAYS_MS = \[0, 500, 1500\]/)
  assert.match(retry, /429\|500\|502\|503\|504/)
  assert.match(retry, /no server is currently available/)
  assert.match(retry, /temporarily unavailable/)
  assert.match(retry, /for \(let attempt = 0; attempt < MAX_ATTEMPTS; attempt \+= 1\)/)
  assert.match(retry, /isTransientApprovedRemediationFailure/)
  assert.doesNotMatch(retry, /approve_audit_run_remediation/)

  for (const route of [approval, runs, cron]) {
    assert.match(route, /runApprovedAuditRemediationWithRetry/)
  }
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

test('schema drift fails closed with actionable repair state', () => {
  const route = read('../app/api/hub/operator/audit/approve-all/route.ts')
  assert.match(route, /audit_approval_schema_not_ready/)
  assert.match(route, /column \"approved\" of relation \"audit_runs\" does not exist/)
  assert.match(route, /column reference \"run_id\" is ambiguous/)
  assert.match(route, /requiredMigrations: REQUIRED_MIGRATIONS/)
  assert.match(route, /repairCompleted: schemaRepaired/)
  assert.match(route, /repairFailedStep: schemaRepairFailedStep/)
  assert.match(route, /status: 503/)
  assert.doesNotMatch(route, /error: approval\.error\.message/)
})

test('known schema drift runs fixed SQL as one statement per RPC and retries approval once', () => {
  const route = read('../app/api/hub/operator/audit/approve-all/route.ts')
  const repair = read('../lib/audit/approvalSchemaRepair.ts')

  assert.match(route, /AUDIT_APPROVAL_SCHEMA_REPAIR_STATEMENTS/)
  assert.match(route, /for \(const \[index, query\] of AUDIT_APPROVAL_SCHEMA_REPAIR_STATEMENTS\.entries\(\)\)/)
  assert.match(route, /admin\.rpc\('hub_exec_sql', \{ query \}\)/)
  assert.match(route, /schemaRepairFailedStep = index \+ 1/)
  assert.equal((route.match(/admin\.rpc\('approve_audit_run_remediation'/g) || []).length, 2)
  assert.match(route, /schemaRepairAttempted = true/)
  assert.match(route, /event: 'audit_approval_schema_repaired'/)
  assert.doesNotMatch(route, /query:\s*body\.|query:\s*payload\.|query:\s*req\./)

  assert.match(repair, /export const AUDIT_APPROVAL_SCHEMA_REPAIR_STATEMENTS = \[/)
  assert.equal((repair.match(/String\.raw`/g) || []).length, 9)
  assert.match(repair, /drop function if exists public\.approve_audit_run_remediation/)
  assert.match(repair, /create table if not exists public\.audit_remediation_approvals/)
  assert.match(repair, /set status = 'approved'/)
  assert.match(repair, /grant execute on function public\.approve_audit_run_remediation\(uuid, uuid\) to service_role/)
  assert.match(repair, /notify pgrst, 'reload schema'/)
  assert.doesNotMatch(repair, /set approved\s*=/)
  assert.doesNotMatch(repair, /AUDIT_APPROVAL_SCHEMA_REPAIR_SQL/)
  assert.doesNotMatch(repair, /String\.raw`\s*begin;/)
  assert.doesNotMatch(repair, /commit;/)
})

test('repair migration replaces the stale approved-column RPC with canonical status approval', () => {
  const migration = read('../supabase/migrations/20260719_repair_audit_approval_schema_drift.sql')
  assert.match(migration, /create or replace function public\.approve_audit_run_remediation/)
  assert.match(migration, /set status = 'approved'/)
  assert.match(migration, /where id = p_run_id and status = 'complete'/)
  assert.doesNotMatch(migration, /set approved\s*=/)
  assert.match(migration, /grant execute on function public\.approve_audit_run_remediation\(uuid, uuid\) to service_role/)
})
