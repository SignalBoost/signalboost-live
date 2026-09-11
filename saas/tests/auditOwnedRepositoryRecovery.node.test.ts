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
  assert.match(recovery, /Do not change secure product code merely to satisfy or silence an unsupported Audit finding/)
  assert.match(recovery, /Never weaken the Audit scanner, suppress a category globally, hard-code a passing result/)
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
