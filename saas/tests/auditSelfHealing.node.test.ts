import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseAuditFindingsResponse } from '../lib/audit/modelResponse.ts'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('Audit findings parser accepts structured object output and legacy arrays', () => {
  const structured = JSON.stringify({
    findings: [{
      severity: 'high',
      category: 'authorization',
      title: 'Missing owner check',
      detail: 'A protected action is reachable without the expected owner gate.',
      recommendation: 'Require the existing owner authorization before the action.',
      line: 12,
    }],
  })
  const parsed = parseAuditFindingsResponse(structured, 'app/api/example/route.ts')
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].file, 'app/api/example/route.ts')
  assert.equal(parsed[0].severity, 'high')

  assert.deepEqual(parseAuditFindingsResponse('{"findings":[]}', 'clean.ts'), [])
  assert.deepEqual(parseAuditFindingsResponse('```json\n{"findings":[]}\n```', 'clean.ts'), [])
  assert.deepEqual(parseAuditFindingsResponse('[]', 'legacy.ts'), [])
})

test('Audit findings parser still fails closed for malformed model output', () => {
  assert.throws(
    () => parseAuditFindingsResponse('I found no issues.', 'bad.ts'),
    /invalid Audit JSON/,
  )
  assert.throws(
    () => parseAuditFindingsResponse('{"answer":"clean"}', 'bad.ts'),
    /did not contain a findings array/,
  )
})

test('Audit scan uses transport-enforced strict JSON object output', () => {
  const router = read('../lib/audit/modelRouter.ts')
  const runner = read('../lib/audit/runner.ts')
  assert.match(router, /Return ONLY strict JSON/)
  assert.match(runner, /Return ONLY a strict JSON object/)
  assert.match(runner, /\{\"findings\":\[/)
  assert.doesNotMatch(runner, /Return ONLY a JSON array/)
})

test('owned canonical audits enter Self-Healing automatically', () => {
  const route = read('../app/api/hub/operator/audit/route.ts')
  const selfHealing = read('../self-healing-host/owned-audit-self-healing.ts')

  assert.match(route, /ctx\.isOwner && isCanonicalOwnedAuditTarget\(prefix\)/)
  assert.match(route, /authorizeOwnedAuditFindings/)
  assert.match(route, /runAuthorizedOwnedAuditFindingsRemediation/)
  assert.match(route, /enqueueOwnedAuditEngineRepair/)
  assert.match(route, /Self-Healing Supervisor scheduled an automatic Audit-system repair/)
  assert.match(route, /after\(async \(\) =>/)

  assert.match(selfHealing, /SignalBoost\/signalboost-live/)
  assert.match(selfHealing, /approve_audit_run_remediation_v2/)
  assert.match(selfHealing, /runApprovedAuditRemediationWithRetry/)
  assert.match(selfHealing, /enqueueSignalBoostRepositoryRepairJob/)
  assert.match(selfHealing, /selfHealingOwnedAudit: true/)
  assert.match(selfHealing, /standing-owner-policy/)
})

test('automatic audit writes remain restricted to the owned main repository', () => {
  const selfHealing = read('../self-healing-host/owned-audit-self-healing.ts')
  assert.match(selfHealing, /parsed\.repo\.toLowerCase\(\) !== REPO\.toLowerCase\(\)/)
  assert.match(selfHealing, /!parsed\.branch \|\| parsed\.branch === BASE_BRANCH/)
  assert.match(selfHealing, /Automatic remediation is restricted to the canonical owned repository/)
})
