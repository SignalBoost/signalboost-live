import test from 'node:test'
import assert from 'node:assert/strict'
import { readUiSource } from './helpers/sourceWithUiCopy.mjs'

const read = (path: string) => readUiSource(new URL(path, import.meta.url))

test('merged PR recovery runs before any deleted source branch is read', () => {
  const retry = read('../lib/audit/approvedRunRemediationRetry.ts')
  const merged = read('../lib/audit/approvedRunMergedRecovery.ts')

  const mergedCall = retry.indexOf('recoverMergedApprovedRemediation(params)')
  const systemCall = retry.indexOf('runApprovedAuditRemediationSystem(params)')
  assert.ok(mergedCall >= 0, 'merged remediation preflight is missing')
  assert.ok(systemCall > mergedCall, 'merged PR recovery must run before source preparation')

  assert.match(merged, /resolvedPull\.data\?\.merged/)
  assert.match(merged, /finalize_audit_run_remediation_v2/)
  assert.match(merged, /lifecycleStatus: 'merged'/)
  assert.match(merged, /merge_commit_sha/)
  assert.doesNotMatch(merged, /contents\/\$\{encoded\}\?ref=/)
})

test('replacement remediation PRs on the same branch are recovered and finalized', () => {
  const merged = read('../lib/audit/approvedRunMergedRecovery.ts')

  assert.match(merged, /resolveMergedPullRequest/)
  assert.match(merged, /pulls\?head=\$\{OWNER\}:\$\{encodeURIComponent\(branch\)\}&state=closed/)
  assert.match(merged, /detail\.data\?\.merged/)
  assert.match(merged, /resolvedPrNumber/)
  assert.match(merged, /prNumber: resolvedPrNumber/)
  assert.match(merged, /Number\(latest\?\.prNumber \|\| 0\) !== resolvedPrNumber/)
})

test('replacement remediation PRs must merge into main before finalization', () => {
  const merged = read('../lib/audit/approvedRunMergedRecovery.ts')

  assert.match(merged, /const BASE_BRANCH = 'main'/)
  assert.match(merged, /function targetsProductionBase/)
  assert.match(merged, /pull\?\.base\?\.ref/)
  assert.match(merged, /direct\.data\?\.merged && targetsProductionBase\(direct\.data\)/)
  assert.match(merged, /detail\.data\?\.merged && targetsProductionBase\(detail\.data\)/)
  assert.match(merged, /function failClosedWrongBase/)
  assert.match(merged, /return \{ \.\.\.pull, merged: false \}/)
})

test('legacy preparation cannot merge before lifecycle support files are committed', () => {
  const engine = read('../lib/audit/approvedRunRemediation.ts')
  const system = read('../lib/audit/approvedRunRemediationSystem.ts')

  assert.match(engine, /Deferred to the end-to-end remediation controller/)
  assert.doesNotMatch(engine, /const autoMerge = await queueAutoMerge\(prNumber\)/)
  assert.match(engine, /payload\?\.status !== 'partial'/)
  assert.match(engine, /payload\?\.lifecycleStatus !== 'partial'/)

  const localization = system.indexOf('ensureLocalizationCatalogs({')
  const reconciliation = system.indexOf('return reconcilePullRequest({')
  assert.ok(localization >= 0, 'localization preparation is missing')
  assert.ok(reconciliation > localization, 'merge reconciliation must happen after localization')
})

test('transient partial writes resume on the same deterministic branch', () => {
  const retry = read('../lib/audit/approvedRunRemediationRetry.ts')
  const partial = read('../lib/audit/approvedRunPartialRecovery.ts')

  assert.match(retry, /recoverTransientPartialAuditWrites/)
  assert.match(retry, /last\.status === 'partial'/)
  assert.match(retry, /last\.lifecycleStatus === 'checks_pending'/)
  assert.match(partial, /params\.result\.branch/)
  assert.match(partial, /commitFileToBranch/)
  assert.match(partial, /AI audit remediation: resume approved run/)
  assert.match(partial, /transientReason/)
  assert.match(partial, /skipped\.some\(item => transientReason\(item\.reason\)\)/)
  assert.doesNotMatch(partial, /branch:\s*['"]main['"]/)
})

test('non-transient safety skips remain partial and are never force-applied or finalized', () => {
  const retry = read('../lib/audit/approvedRunRemediationRetry.ts')
  const partial = read('../lib/audit/approvedRunPartialRecovery.ts')
  const system = read('../lib/audit/approvedRunRemediationSystem.ts')
  const merged = read('../lib/audit/approvedRunMergedRecovery.ts')
  const lifecycle = read('../lib/audit/remediationLifecycleRepair.ts')
  const migration = read('../supabase/migrations/20260720_audit_remediation_lifecycle_v2.sql')

  assert.match(partial, /category\.toLowerCase\(\) !== 'i18n-raw-string'/)
  assert.match(partial, /unsupported \+= 1/)
  assert.match(retry, /restoreSafetySkips/)
  assert.match(retry, /original\.skipped\.filter\(item => !transientReason\(item\.reason\)\)/)
  assert.match(retry, /hasSafetySkip/)
  assert.match(retry, /lifecycleStatus: 'partial'/)

  const partialGuard = system.indexOf("params.result.status === 'partial'")
  const mergedPath = system.indexOf('if (pr.merged)')
  assert.ok(partialGuard >= 0, 'partial merge guard is missing')
  assert.ok(mergedPath > partialGuard, 'partial runs must be refused before merged-PR finalization')
  assert.match(merged, /candidate\.status === 'partial' \|\| candidate\.lifecycleStatus === 'partial'/)
  assert.match(merged, /unresolved findings remain open/)

  for (const sql of [lifecycle, migration]) {
    assert.match(sql, /l\.payload ->> 'kind' = 'audit_batch_remediation'/)
    assert.match(sql, /coalesce\(l\.payload ->> 'status', ''\) <> 'partial'/)
    assert.match(sql, /coalesce\(l\.payload ->> 'lifecycleStatus', ''\) <> 'partial'/)
    assert.match(sql, /findingsApplied'[\s\S]*findingsAlreadyResolved'[\s\S]*findingsTotal'/)
  }
})

test('findings are finalized only from a confirmed merged GitHub PR', () => {
  const merged = read('../lib/audit/approvedRunMergedRecovery.ts')
  const system = read('../lib/audit/approvedRunRemediationSystem.ts')
  const lifecycle = read('../lib/audit/remediationLifecycleRepair.ts')
  const route = read('../app/api/hub/operator/audit/approve-all/route.ts')

  assert.match(merged, /if \(!resolvedPull\.data\?\.merged\) return null/)
  assert.match(system, /if \(pr\.merged\)/)
  assert.match(system, /mergeableState !== 'clean'/)
  assert.match(lifecycle, /finalize_audit_run_remediation_v2/)
  assert.match(lifecycle, /set fixed = true/)
  assert.match(lifecycle, /audit_run_remediated/)

  // Approval is asynchronous: the HTTP response must never claim a finding is fixed.
  // Only the merged-PR recovery/system path above may call the finalizer.
  assert.match(route, /findingsFixed: 0/)
  assert.match(route, /status: 'preparing'/)
  assert.match(route, /lifecycleStatus: 'preparing'/)
  assert.match(route, /\}, \{ status: 202 \}\)/)
  assert.doesNotMatch(route, /finalize_audit_run_remediation_v2/)
  assert.doesNotMatch(route, /findingsApplied \+ remediation\.findingsAlreadyResolved/)
})

test('the Audit Console displays and refreshes the real autonomous remediation lifecycle', () => {
  const dashboard = read('../app/dashboard/audit/page.tsx')
  const panel = read('../components/audit/RemediationLifecyclePanel.tsx')

  assert.match(dashboard, /RemediationLifecyclePanel/)
  assert.match(dashboard, /setRemediation\(lifecycle\)/)
  assert.match(dashboard, /setInterval\(\(\) => \{ void openRun\(selectedRunId\) \}, 10000\)/)
  assert.match(dashboard, /remediationState\?\.lifecycleStatus === 'merged'/)
  assert.match(dashboard, /state=\{remediation\}/)
  assert.match(dashboard, /This is the only approval/)
  assert.doesNotMatch(dashboard, /RemediationBanner|PatchPreview|Confirm & Push Pull Request|Open remediation PR/)

  for (const lang of ['en', 'es', 'pt', 'pl', 'ru']) {
    assert.match(panel, new RegExp(`\\b${lang}: \\{`))
  }
  assert.doesNotMatch(panel, /prUrl|prNumber|openPr|href=/)
  assert.match(panel, /status === 'merged'/)
  assert.match(panel, /status === 'failed'/)
  assert.match(panel, /status === 'partial'/)
  assert.match(panel, /role="progressbar"/)
})

test('the required workflow executes autonomous-boundary, approval, and lifecycle regressions', () => {
  const workflow = read('../../.github/workflows/audit-remediation-regression.yml')
  assert.match(workflow, /npm run test:audit-remediation/)
  assert.match(workflow, /npm run test:audit-global-approval/)
  assert.match(workflow, /node --test tests\/auditRemediationSystem\.node\.test\.ts/)
  assert.doesNotMatch(workflow, /test:audit-consent/)
})

test('approved runs expose a visible live status pipeline before the first lifecycle event', () => {
  const dashboard = read('../app/dashboard/audit/page.tsx')
  const panel = read('../components/audit/RemediationLifecyclePanel.tsx')
  const runs = read('../app/api/hub/operator/audit/runs/route.ts')

  assert.match(dashboard, /approvedWithoutLifecycle/)
  assert.match(dashboard, /r\?\.status === 'approved'/)
  assert.match(dashboard, /lifecycleStatus: 'preparing'/)
  assert.match(dashboard, /cache: 'no-store'/)
  assert.match(dashboard, /setApprovalMessage\(null\); setSelectedRunId\(id\)/)
  assert.match(runs, /recovery \|\| payloads\.remediation/)
  assert.match(runs, /withActivity/)
  assert.doesNotMatch(runs, /payloads\.remediation \|\| recovery/)
  assert.match(panel, /stepApproval: 'Approval recorded'/)
  assert.match(panel, /stepPrepare: 'AI prepares fixes'/)
  assert.match(panel, /stepChecks: 'AI validates'/)
  assert.match(panel, /stepMerge: 'AI merges'/)
  assert.match(panel, /stepVerified: 'AI verifies'/)
  assert.match(panel, /aria-label=\{copy\.pipelineLabel\}/)
  assert.match(panel, /Live monitor: waiting for GitHub checks/)
})

test('reconciliation distinguishes pending, failed, repairing, and successful checks', () => {
  const system = read('../lib/audit/approvedRunRemediationSystem.ts')
  assert.match(system, /check-runs\?per_page=100/)
  assert.match(system, /commits\/\$\{encodeURIComponent\(headSha\)\}\/status/)
  assert.match(system, /PASSING_CHECK_CONCLUSIONS/)
  assert.match(system, /Protected checks failed:/)
  assert.match(system, /pulls\/\$\{pr\.number\}\/update-branch/)
  assert.match(system, /checks\.state === 'success'/)
  assert.match(system, /!autoMerge\.queued && checks\.state === 'success'/)
})
