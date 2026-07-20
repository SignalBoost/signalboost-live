import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('merged PR recovery runs before any deleted source branch is read', () => {
  const retry = read('../lib/audit/approvedRunRemediationRetry.ts')
  const merged = read('../lib/audit/approvedRunMergedRecovery.ts')

  const mergedCall = retry.indexOf('recoverMergedApprovedRemediation(params)')
  const systemCall = retry.indexOf('runApprovedAuditRemediationSystem(params)')
  assert.ok(mergedCall >= 0, 'merged remediation preflight is missing')
  assert.ok(systemCall > mergedCall, 'merged PR recovery must run before source preparation')

  assert.match(merged, /pull\.data\?\.merged/)
  assert.match(merged, /finalize_audit_run_remediation_v2/)
  assert.match(merged, /lifecycleStatus: 'merged'/)
  assert.match(merged, /merge_commit_sha/)
  assert.doesNotMatch(merged, /contents\/\$\{encoded\}\?ref=/)
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

test('non-transient safety skips remain partial and are never force-applied', () => {
  const retry = read('../lib/audit/approvedRunRemediationRetry.ts')
  const partial = read('../lib/audit/approvedRunPartialRecovery.ts')

  assert.match(partial, /category\.toLowerCase\(\) !== 'i18n-raw-string'/)
  assert.match(partial, /unsupported \+= 1/)
  assert.match(retry, /restoreSafetySkips/)
  assert.match(retry, /original\.skipped\.filter\(item => !transientReason\(item\.reason\)\)/)
  assert.match(retry, /hasSafetySkip/)
  assert.match(retry, /lifecycleStatus: 'partial'/)
})

test('findings are finalized only from a confirmed merged GitHub PR', () => {
  const merged = read('../lib/audit/approvedRunMergedRecovery.ts')
  const system = read('../lib/audit/approvedRunRemediationSystem.ts')
  const lifecycle = read('../lib/audit/remediationLifecycleRepair.ts')

  assert.match(merged, /if \(!pull\.data\?\.merged\) return null/)
  assert.match(system, /if \(pr\.merged\)/)
  assert.match(system, /mergeableState !== 'clean'/)
  assert.match(lifecycle, /finalize_audit_run_remediation_v2/)
  assert.match(lifecycle, /set fixed = true/)
  assert.match(lifecycle, /audit_run_remediated/)
})

test('the required workflow executes consent, approval, and lifecycle regressions', () => {
  const workflow = read('../../.github/workflows/audit-remediation-regression.yml')
  assert.match(workflow, /npm run test:audit-consent/)
  assert.match(workflow, /npm run test:audit-global-approval/)
  assert.match(workflow, /node --test tests\/auditRemediationSystem\.node\.test\.ts/)
})
