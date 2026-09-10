import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
}

test('owned Audit remediation failure escalates to repository-aware Platform Engineer', () => {
  const selfHealing = read('../self-healing-host/owned-audit-self-healing.ts')
  const runsRoute = read('../app/api/hub/operator/audit/runs/route.ts')

  assert.match(selfHealing, /enqueueOwnedAuditFindingsRepositoryRepair/)
  assert.match(selfHealing, /audit-console-findings-recovery/)
  assert.match(selfHealing, /Verify every Audit finding against related imports, helpers, configuration, tests, and available authoritative runtime evidence before editing/)
  assert.match(selfHealing, /Do not change secure product code merely to satisfy or silence an unsupported Audit finding/)
  assert.match(selfHealing, /lifecycleStatus: 'repairing'/)
  assert.match(selfHealing, /selfHealingOwnedAudit: true/)
  assert.match(selfHealing, /auditRunId: params\.runId/)

  assert.match(runsRoute, /runAuthorizedOwnedAuditFindingsRemediation/)
  assert.doesNotMatch(runsRoute, /return await runApprovedAuditRemediationWithRetry/)
})

test('per-file Audit findings require source evidence and must not infer unseen controls', () => {
  const runner = read('../lib/audit/runner.ts')
  assert.match(runner, /A finding is allowed only when the supplied source directly supports the claim/)
  assert.match(runner, /Do not infer the implementation or privilege of imported helpers/)
  assert.match(runner, /server-side logging is not client information disclosure/)
  assert.match(runner, /delegated control or guard is not evidence that the control is absent/)
})

test('Audit browser preserves backend automatic status instead of manufacturing complete', () => {
  const page = read('../app/dashboard/audit/page.tsx')
  assert.match(page, /status\?: string/)
  assert.match(page, /status: evt\.status \|\| 'complete'/)
  assert.doesNotMatch(page, /status: 'complete' \}/)
  assert.match(page, /view\.status === 'complete'/)
  assert.match(page, /view\.status !== 'complete'/)
})
