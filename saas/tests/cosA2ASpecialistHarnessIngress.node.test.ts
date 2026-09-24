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
import {
  COS_PRIMARY_SOFTWARE_DELEGATION_CAPABILITY,
  createCosProductionIngressManifest,
  withCosHarnessIngress,
} from '../platform-harness/adapters/cos-ingress.ts'

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
  assert.ok(String(evidence[0]?.parentRunId || '').startsWith('cos-'))
  assert.ok(String(evidence[0]?.parentAuthorityManifestRef || '').startsWith('host://cos-primary-ingress/'))
  assert.equal(currentCosA2ASpecialistHarnessIngress(), null)
})

test('A2A specialist child inherits lineage from the active COS parent run', async () => {
  const parent = createCosProductionIngressManifest({
    runId: 'cos-parent-a2a',
    objective: 'COS turn that delegates to a specialist',
    tenantId: scope.tenantId,
    requestedCapabilities: [COS_A2A_SPECIALIST_DELEGATION_CAPABILITY],
  })
  const evidence: any[] = []
  let parentSeen = ''
  const result = await withCosHarnessIngress(parent, () => runCosA2ASpecialistProductionHarness({
    objective: 'delegate under parent',
    scope,
    runId: 'a2a-child-of-parent',
    evidenceSink: { async append(record) { evidence.push(record) } },
    execute: async () => {
      parentSeen = requireCosA2ASpecialistHarnessIngress().parentRunId
      return 'done'
    },
  }))
  assert.equal(result.ok, true)
  assert.equal(parentSeen, 'cos-parent-a2a')
  assert.equal(evidence[0]?.parentRunId, 'cos-parent-a2a')
})

test('A2A specialist child cannot widen a COS parent that never granted specialist delegation', async () => {
  const parent = createCosProductionIngressManifest({
    runId: 'cos-parent-software-only',
    objective: 'software-only COS parent',
    tenantId: scope.tenantId,
    requestedCapabilities: [COS_PRIMARY_SOFTWARE_DELEGATION_CAPABILITY],
  })
  let calls = 0
  const result = await runCosA2ASpecialistProductionHarness({
    objective: 'attempt widening',
    scope,
    runId: 'a2a-widening-attempt',
    parentManifest: parent,
    evidenceSink: { async append() {} },
    execute: async () => { calls += 1; return 'unexpected' },
  })
  assert.equal(result.ok, false)
  assert.equal(calls, 0)
  if (result.ok === false) assert.equal(result.code, `child_capability_widening_forbidden:${COS_A2A_SPECIALIST_DELEGATION_CAPABILITY}`)
})

test('A2A specialist child cannot cross into another tenant than its COS parent', async () => {
  const parent = createCosProductionIngressManifest({
    runId: 'cos-parent-other-tenant',
    objective: 'parent for another tenant',
    tenantId: 'another-tenant',
    requestedCapabilities: [COS_A2A_SPECIALIST_DELEGATION_CAPABILITY],
  })
  let calls = 0
  const result = await runCosA2ASpecialistProductionHarness({
    objective: 'cross-tenant attempt',
    scope,
    parentManifest: parent,
    evidenceSink: { async append() {} },
    execute: async () => { calls += 1; return 'unexpected' },
  })
  assert.equal(result.ok, false)
  assert.equal(calls, 0)
  if (result.ok === false) assert.equal(result.code, 'child_tenant_mismatch')
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
