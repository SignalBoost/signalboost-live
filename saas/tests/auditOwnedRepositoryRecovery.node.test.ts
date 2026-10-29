import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
}

test('owned model-written Audit findings escalate before single-file mutation', () => {
  const retry = read('../lib/audit/approvedRunRemediationRetry.ts')
  const recovery = read('../lib/audit/ownedAuditRepositoryRecovery.ts')

  assert.match(retry, /maybeRecoverOwnedAuditWithRepositoryEvidence/)
  assert.match(retry, /const evidenceRecovery = await repositoryAwareRecovery\(params\)/)
  assert.match(retry, /if \(evidenceRecovery\) return evidenceRecovery/)
  assert.match(retry, /repositoryAwareRecovery\(params, last\)/)

  assert.match(recovery, /SOURCE_LOCAL_CATEGORIES/)
  assert.match(recovery, /audit-findings:\$\{runId\}/)
  assert.match(recovery, /selfHealingOwnedAudit: true/)
  assert.match(recovery, /selfHealingSource: 'audit-console-findings-recovery'/)
  assert.match(recovery, /lifecycleStatus: 'repairing'/)
  assert.match(recovery, /enqueueSignalBoostRepositoryRepairJob/)
})

test('repository-aware recovery verifies claims instead of score-gaming product code', () => {
  const recovery = read('../lib/audit/ownedAuditRepositoryRecovery.ts')
  assert.match(recovery, /Verify every Audit finding against related imports, helpers, configuration, tests, and available authoritative runtime evidence before editing/)
  assert.match(recovery, /Do not infer service-role use, database policy, cookie policy, CSRF posture, deployment configuration, or client disclosure/)
  assert.match(recovery, /do not change secure product code merely to satisfy or silence an unsupported Audit finding/i)
  assert.match(recovery, /Never weaken the Audit scanner, suppress a category globally, hard-code a passing result/)
  assert.match(recovery, /run only narrow directly relevant tests/)
  assert.match(recovery, /Never run npm test or the complete repository suite/)
  assert.match(recovery, /Treat exit 137 as execution-resource exhaustion/)
  assert.match(recovery, /auditOwnedRepositoryRecovery\.node\.test\.ts/)
  assert.match(recovery, /Re-run the affected Audit scope after the repair/)
})

test('per-file Audit analysis requires direct source evidence', () => {
  const runner = read('../lib/audit/runner.ts')
  assert.match(runner, /A finding is allowed only when the supplied source directly supports the claim/)
  assert.match(runner, /Do not infer the implementation or privilege of imported helpers/)
  assert.match(runner, /delegated control or guard is not evidence that the control is absent or bypassed/)
  assert.match(runner, /server-side logging is not client information disclosure/)
  assert.match(runner, /only concerns depend on evidence that is not present in this file/)
})

test('foreign repositories cannot acquire owned recovery authority', () => {
  const recovery = read('../lib/audit/ownedAuditRepositoryRecovery.ts')
  assert.match(recovery, /parsed\.repo\.toLowerCase\(\) !== REPO\.toLowerCase\(\)/)
  assert.match(recovery, /!parsed\.branch \|\| parsed\.branch === BASE_BRANCH/)
  assert.match(recovery, /runResult\.data\.status !== 'approved'/)
})

test('a failed audit repair is not re-queued every monitoring cycle (Production 2026-10-22: 9 jobs in 3 hours)', () => {
  const recovery = read('../lib/audit/ownedAuditRepositoryRecovery.ts')
  assert.match(recovery, /const FAILED_RETRY_SUPPRESSION_MS = 6 \* 60 \* 60 \* 1000/)
  assert.match(recovery, /disposition: 'recently_failed'/)
  const engine = read('../self-healing-host/owned-audit-self-healing.ts')
  const recent = engine.slice(engine.indexOf('async function existingEngineAttempt'))
  assert.match(recent, /\.in\('status', \['succeeded', 'failed'\]\)\n\s*\.gte\('created_at', since\)/)
})

test('unchanged Audit run does not repeatedly spend on terminal Builder failures', async () => {
  const { terminalAuditRecoveryFailure } = await import('../lib/audit/ownedAuditRepositoryRecovery.ts')
  for (const reason of [
    'builder_v2_continuation_no_progress',
    'builder_stalled_repeated_inspection',
    'harness_provider_cost_budget_exceeded',
    'builder_v2_model_call_budget_exhausted',
    'builder_v2_total_deadline_exceeded',
  ]) assert.equal(terminalAuditRecoveryFailure(reason), true, reason)
  assert.equal(terminalAuditRecoveryFailure('provider_temporarily_unavailable'), false)
  const source = read('../lib/audit/ownedAuditRepositoryRecovery.ts')
  const lookup = source.slice(source.indexOf('const lastFailure = await admin'), source.indexOf('const failedSince ='))
  assert.match(lookup, /\.eq\('status', 'failed'\)/)
  assert.match(lookup, /selfHealingKey: key/)
  assert.doesNotMatch(lookup, /\.gte\('created_at'/)
  assert.match(lookup, /terminalAuditRecoveryFailure/)
})
