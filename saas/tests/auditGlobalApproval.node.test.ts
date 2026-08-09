import test from 'node:test'
import assert from 'node:assert/strict'
import { readUiSource } from './helpers/sourceWithUiCopy.mjs'

const read = (path: string) => readUiSource(new URL(path, import.meta.url))

test('audit dashboard exposes one global approval and no per-finding patch approval control', () => {
  const dashboard = read('../app/dashboard/audit/page.tsx')
  assert.match(dashboard, /approveAllFixes/)
  assert.match(dashboard, /Approve all fixes/)
  assert.match(dashboard, /\/api\/hub\/operator\/audit\/approve-all/)
  assert.doesNotMatch(dashboard, /import PatchPreview/)
  assert.doesNotMatch(dashboard, /<PatchPreview/)
})

test('global approval uses the truthful v2 lifecycle and remains run scoped', () => {
  const route = read('../app/api/hub/operator/audit/approve-all/route.ts')
  const migration = read('../supabase/migrations/20260720_audit_remediation_lifecycle_v2.sql')

  assert.match(route, /isUuid\(body\.runId\)/)
  assert.match(route, /approve_audit_run_remediation_v2/)
  assert.match(route, /already_approved/)
  assert.match(route, /runApprovedAuditRemediationWithRetry/)
  assert.match(route, /findingsFixed = remediation\.merged/)
  assert.match(route, /status: remediation\.lifecycleStatus/)

  assert.match(migration, /where id = p_run_id\s+and status = 'complete'/)
  assert.match(migration, /findingsApproved/)
  assert.match(migration, /findingsFixed', 0/)
})

test('owner approval does not claim findings are fixed before GitHub merge', () => {
  const migration = read('../supabase/migrations/20260720_audit_remediation_lifecycle_v2.sql')
  const approvalPart = migration.split('create or replace function public.finalize_audit_run_remediation_v2')[0]
  const finalizerPart = migration.split('create or replace function public.finalize_audit_run_remediation_v2')[1] || ''

  assert.doesNotMatch(approvalPart, /set fixed = true/)
  assert.match(approvalPart, /findings_fixed,\s*status[\s\S]*0,\s*'approved'/)
  assert.match(finalizerPart, /set fixed = true/)
  assert.match(finalizerPart, /set status = 'remediated'/)
  assert.match(finalizerPart, /audit_run_remediated/)
  assert.match(finalizerPart, /mergeCommitSha/)
})

test('approved remediation writes only to an ai branch and never bypasses main protection', () => {
  const engine = read('../lib/audit/approvedRunRemediation.ts')
  const system = read('../lib/audit/approvedRunRemediationSystem.ts')

  assert.match(engine, /const REPO = 'SignalBoost\/signalboost-live'/)
  assert.match(engine, /const BASE_BRANCH = 'main'/)
  assert.match(engine, /ai\/audit-run-/)
  assert.match(engine, /commitFileToBranch/)
  assert.doesNotMatch(engine, /branch:\s*['"]main['"]/)
  assert.doesNotMatch(engine, /refs\/heads\/main/)

  assert.match(system, /mergeableState !== 'clean'/)
  assert.match(system, /merge_method: 'squash'/)
  assert.match(system, /sha: pr\.headSha/)
  assert.match(system, /finalize_audit_run_remediation_v2/)
  assert.doesNotMatch(system, /force:\s*true/)
})

test('the system recovers missing PR creation and waits for protected checks', () => {
  const system = read('../lib/audit/approvedRunRemediationSystem.ts')

  assert.match(system, /MAX_GITHUB_ATTEMPTS = 3/)
  assert.match(system, /RETRY_DELAYS_MS = \[0, 500, 1500\]/)
  assert.match(system, /pulls\?head=\$\{OWNER\}/)
  assert.match(system, /method: 'POST'[\s\S]*head: branch[\s\S]*base: BASE_BRANCH/)
  assert.match(system, /compareBranch\(base\.branch\)/)
  assert.match(system, /ensurePullRequest\(base\.branch/)
  assert.match(system, /\| 'checks_pending'/)
  assert.match(system, /autoMerge\.queued \? 'auto_merge_queued' : 'checks_pending'/)
  assert.match(system, /queueAutoMerge/)
  assert.match(system, /mergeCleanPullRequest/)
})

test('approved i18n findings receive real four-language catalog entries before merge', () => {
  const system = read('../lib/audit/approvedRunRemediationSystem.ts')

  assert.match(system, /SUPPORTED_LANGS = \['es', 'pt', 'pl', 'ru'\]/)
  assert.match(system, /ROOT_CATALOG = 'lib\/i18n\/approvedAuditRemediationCopy\.ts'/)
  assert.match(system, /SAAS_CATALOG = 'saas\/lib\/i18n\/approvedAuditRemediationCopy\.ts'/)
  assert.match(system, /ensureLocalizationCatalogs/)
  assert.match(system, /callAuditModel/)
  assert.match(system, /keyCount\(proposed, phrase\) !== SUPPORTED_LANGS\.length/)
  assert.match(system, /commitFileToBranch/)
  assert.match(system, /Translate naturally and professionally/)
})

test('approved security and code findings use governed AI remediation with source guardrails', () => {
  const engine = read('../lib/audit/approvedRunRemediation.ts')
  assert.match(engine, /category\.toLowerCase\(\) === 'i18n-raw-string'/)
  assert.match(engine, /LocalizedText/)
  assert.match(engine, /rawJsxTextPresent/)
  assert.match(engine, /callAuditModel/)
  assert.match(engine, /aiRemediateFile/)
  assert.match(engine, /fixedFindingIndexes/)
  assert.match(engine, /complete file/i)
  assert.match(engine, /findBadImports/)
  assert.match(engine, /preservedFraction/)
  assert.match(engine, /MAX_AI_FILE_CHARS/)
  assert.match(engine, /ai\/audit-run-/)
})

test('recovery cron and owner history resume the same approved lifecycle', () => {
  const cron = read('../app/api/cron/audit-approved-remediation/route.ts')
  const runs = read('../app/api/hub/operator/audit/runs/route.ts')
  const vercel = read('../vercel.json')

  assert.match(cron, /\.eq\('status', 'approved'\)/)
  assert.match(cron, /\.order\('created_at', \{ ascending: false \}\)/)
  assert.match(cron, /\.limit\(1\)/)
  assert.match(cron, /audit_remediation_approvals/)
  assert.match(cron, /runApprovedAuditRemediationWithRetry/)
  assert.match(vercel, /"path": "\/api\/cron\/audit-approved-remediation"[\s\S]*?"schedule": "\*\/10 \* \* \* \*"/)

  assert.match(runs, /if \(!ctx\.isOwner \|\| !ctx\.userId\)/)
  assert.match(runs, /const newestApproved = \(runs\.data \|\| \[\]\)\.find/)
  assert.match(runs, /recoverApprovedRun\(admin, String\(newestApproved\.id\), ctx\.userId\)/)
  assert.match(runs, /recovery \|\| payloads\.remediation/)
  assert.match(runs, /withActivity/)
  assert.doesNotMatch(runs, /payloads\.remediation \|\| recovery/)
  assert.doesNotMatch(runs, /approve_audit_run_remediation_v2/)
})

test('transient GitHub failures retry without repeating owner approval', () => {
  const retry = read('../lib/audit/approvedRunRemediationRetry.ts')
  const approval = read('../app/api/hub/operator/audit/approve-all/route.ts')
  const runs = read('../app/api/hub/operator/audit/runs/route.ts')
  const cron = read('../app/api/cron/audit-approved-remediation/route.ts')

  assert.match(retry, /const MAX_ATTEMPTS = 3/)
  assert.match(retry, /const RETRY_DELAYS_MS = \[0, 500, 1500\]/)
  assert.match(retry, /429\|500\|502\|503\|504/)
  assert.match(retry, /no server is currently available/)
  assert.match(retry, /runApprovedAuditRemediationSystem/)
  assert.doesNotMatch(retry, /approve_audit_run_remediation/)

  for (const route of [approval, runs, cron]) {
    assert.match(route, /runApprovedAuditRemediationWithRetry/)
  }
})

test('lifecycle SQL is fixed, service-role-only, and never request controlled', () => {
  const route = read('../app/api/hub/operator/audit/approve-all/route.ts')
  const lifecycle = read('../lib/audit/remediationLifecycleRepair.ts')

  assert.match(lifecycle, /AUDIT_REMEDIATION_LIFECYCLE_REPAIR_STATEMENTS/)
  assert.match(lifecycle, /approve_audit_run_remediation_v2/)
  assert.match(lifecycle, /finalize_audit_run_remediation_v2/)
  assert.match(lifecycle, /grant execute on function public\.approve_audit_run_remediation_v2/)
  assert.match(lifecycle, /grant execute on function public\.finalize_audit_run_remediation_v2/)
  assert.match(lifecycle, /notify pgrst, 'reload schema'/)
  assert.match(route, /admin\.rpc\('hub_exec_sql', \{ query \}\)/)
  assert.doesNotMatch(route, /query:\s*body\.|query:\s*payload\.|query:\s*req\./)
})

test('legacy schema repair still fails closed and does not write a nonexistent approved column', () => {
  const route = read('../app/api/hub/operator/audit/approve-all/route.ts')
  const repair = read('../lib/audit/approvalSchemaRepair.ts')

  assert.match(route, /audit_approval_schema_not_ready/)
  assert.match(route, /requiredMigrations: REQUIRED_MIGRATIONS/)
  assert.match(route, /repairFailedStep/)
  assert.match(route, /status: 503/)
  assert.doesNotMatch(route, /error: approval\.error\.message/)

  assert.match(repair, /AUDIT_APPROVAL_SCHEMA_REPAIR_STATEMENTS/)
  assert.match(repair, /create table if not exists public\.audit_remediation_approvals/)
  assert.match(repair, /grant execute on function public\.approve_audit_run_remediation\(uuid, uuid\) to service_role/)
  assert.doesNotMatch(repair, /set approved\s*=/)
})
