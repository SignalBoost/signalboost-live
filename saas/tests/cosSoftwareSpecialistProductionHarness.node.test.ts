// saas/tests/cosSoftwareSpecialistProductionHarness.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  COS_SOFTWARE_SPECIALIST_DELEGATION_CAPABILITY,
  runCosSoftwareSpecialistProductionHarness,
} from '../lib/ai/cos/softwareSpecialistHarness.ts'

test('software specialist delegation runs once through the Production Harness and persists evidence', async () => {
  const evidence: any[] = []
  let calls = 0
  const result = await runCosSoftwareSpecialistProductionHarness({
    objective: 'fix the TypeScript build',
    tenantId: 'tenant-test',
    runId: 'software-specialist-harness-test',
    evidenceSink: {
      async append(record) { evidence.push(record) },
    },
    execute: async () => {
      calls += 1
      return { status: 202, jobId: 'job-1' }
    },
  })

  assert.equal(result.ok, true)
  assert.equal(calls, 1)
  assert.equal(evidence.length, 1)
  assert.equal(evidence[0]?.runId, 'software-specialist-harness-test')
  assert.equal(evidence[0]?.profile, 'production')
  assert.equal(evidence[0]?.agentId, 'cos-software-specialist')
  assert.equal(evidence[0]?.outcomeStatus, 'success')
})

test('software specialist Harness fails closed before delegation without exact tenant identity', async () => {
  let calls = 0
  const result = await runCosSoftwareSpecialistProductionHarness({
    objective: 'fix the build',
    tenantId: '',
    runId: 'software-specialist-missing-tenant',
    evidenceSink: { async append() {} },
    execute: async () => { calls += 1; return 'unexpected' },
  })
  assert.equal(result.ok, false)
  assert.equal(calls, 0)
  if (!result.ok) assert.equal(result.code, 'harness_software_specialist_identity_required')
})

test('software specialist Harness capability is exact and write-scoped', () => {
  assert.equal(COS_SOFTWARE_SPECIALIST_DELEGATION_CAPABILITY, 'agent.software.delegate')
})

test('public Software Specialist export cannot bypass the Production Harness', () => {
  const source = readFileSync(new URL('../lib/ai/cos/softwareSpecialist.ts', import.meta.url), 'utf8')
  assert.match(source, /async function tryCosSoftwareSpecialistLegacy\(/)
  assert.doesNotMatch(source, /export async function tryCosSoftwareSpecialistLegacy\(/)
  assert.match(source, /export async function tryCosSoftwareSpecialist\(/)
  assert.match(source, /runCosSoftwareSpecialistProductionHarness\(\{/)
  assert.match(source, /execute: signal => tryCosSoftwareSpecialistLegacy\(input, signal\)/)
  const exported = source.slice(source.indexOf('export async function tryCosSoftwareSpecialist('))
  assert.match(exported, /if \(!specialistRelevant\) return null/)
  assert.ok(
    exported.indexOf('if (!specialistRelevant) return null')
      < exported.indexOf('runCosSoftwareSpecialistProductionHarness({'),
  )
})
