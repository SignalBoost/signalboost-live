// saas/tests/cosA2ASpecialistHarnessIngress.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import {
  COS_A2A_SPECIALIST_DELEGATION_CAPABILITY,
  currentCosA2ASpecialistHarnessIngress,
  requireCosA2ASpecialistHarnessIngress,
  runCosA2ASpecialistProductionHarness,
} from '../lib/ai/cos/a2aSpecialistHarness.ts'

const scope = Object.freeze({
  tenantId: 'tenant-test',
  environmentId: 'env-test',
  portableId: 'portable-test',
})

test('A2A specialist delegation runs once inside a Production HarnessRun and persists evidence', async () => {
  const evidence: any[] = []
  let calls = 0
  let insideRunId = ''
  const result = await runCosA2ASpecialistProductionHarness({
    objective: 'diagnose the failing deployment',
    scope,
    runId: 'a2a-specialist-harness-test',
    evidenceSink: { async append(record) { evidence.push(record) } },
    execute: async () => {
      calls += 1
      insideRunId = requireCosA2ASpecialistHarnessIngress().runId
      return { ok: true, skillId: 'diagnose' }
    },
  })

  assert.equal(result.ok, true)
  assert.equal(calls, 1)
  assert.equal(insideRunId, 'a2a-specialist-harness-test')
  assert.equal(evidence.length, 1)
  assert.equal(evidence[0]?.runId, 'a2a-specialist-harness-test')
  assert.equal(evidence[0]?.profile, 'production')
  assert.equal(evidence[0]?.agentId, 'cos-a2a-specialist')
  assert.equal(evidence[0]?.outcomeStatus, 'success')
  assert.equal(currentCosA2ASpecialistHarnessIngress(), null)
})

test('A2A specialist orchestration fails closed outside the mandatory Harness ingress', () => {
  assert.equal(currentCosA2ASpecialistHarnessIngress(), null)
  assert.throws(() => requireCosA2ASpecialistHarnessIngress(), /a2a_specialist_harness_ingress_required/)
})

test('A2A specialist Harness refuses wildcard or missing scope before delegation', async () => {
  for (const bad of [
    { ...scope, tenantId: '' },
    { ...scope, environmentId: '*' },
    { ...scope, portableId: '' },
  ]) {
    let calls = 0
    const result = await runCosA2ASpecialistProductionHarness({
      objective: 'delegate',
      scope: bad,
      evidenceSink: { async append() {} },
      execute: async () => { calls += 1; return 'unexpected' },
    })
    assert.equal(result.ok, false)
    assert.equal(calls, 0)
    if (result.ok === false) assert.equal(result.code, 'harness_a2a_specialist_identity_required')
  }
})

test('A2A specialist Harness reports a failed delegation without claiming success', async () => {
  const evidence: any[] = []
  const result = await runCosA2ASpecialistProductionHarness({
    objective: 'delegate and fail',
    scope,
    runId: 'a2a-specialist-harness-failure',
    evidenceSink: { async append(record) { evidence.push(record) } },
    execute: async () => { throw new Error('specialist_transport_down') },
  })
  assert.equal(result.ok, false)
  assert.equal(evidence.length, 1)
  assert.notEqual(evidence[0]?.outcomeStatus, 'success')
})

test('A2A specialist Harness capability is exact', () => {
  assert.equal(COS_A2A_SPECIALIST_DELEGATION_CAPABILITY, 'agent.specialist.delegate')
})

test('live /api/cos-specialist route cannot orchestrate outside the Harness', () => {
  const source = readFileSync(join(process.cwd(), 'app/api/cos-specialist/route.ts'), 'utf8')
  const orchestrateCalls = source.match(/\.orchestrator\.orchestrate\(/g) ?? []
  assert.equal(orchestrateCalls.length, 1)
  const harnessCall = source.indexOf('runCosA2ASpecialistProductionHarness({')
  const guardedCall = source.indexOf('orchestrateSpecialistInsideHarness(() => selectedHost.orchestrator.orchestrate(')
  assert.ok(harnessCall >= 0)
  assert.ok(guardedCall > harnessCall)
  const guard = source.indexOf('async function orchestrateSpecialistInsideHarness')
  assert.ok(guard >= 0)
  assert.ok(source.indexOf('requireCosA2ASpecialistHarnessIngress()', guard) > guard)
})
