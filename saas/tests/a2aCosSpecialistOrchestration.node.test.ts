import assert from 'node:assert/strict'
import test from 'node:test'
import { createInMemoryA2AAgentRegistry } from '../a2a-host/a2a-agent-registry.ts'
import { createCOSSpecialistOrchestrator } from '../a2a-host/cos-specialist-orchestrator.ts'

const tenantId = 'tenant-a'
const environmentId = 'prod'
const portableId = 'portable-marketing'

function registry(input?: { second?: boolean; risk?: 'advisory' | 'write' | 'consequential' }) {
  const risk = input?.risk ?? 'advisory'
  return createInMemoryA2AAgentRegistry({
    agents: [
      { agentId: 'marketing-a', displayName: 'Marketing A', description: 'Buyer specialist', transportRef: 'transport-a', enabled: true, advertisedSkillIds: ['marketing.research'] },
      ...(input?.second ? [{ agentId: 'marketing-b', displayName: 'Marketing B', description: 'Buyer specialist', transportRef: 'transport-b', enabled: true, advertisedSkillIds: ['marketing.research'] }] : []),
    ],
    assignments: [
      { assignmentId: 'assignment-a', agentId: 'marketing-a', tenantId, environmentId, portableId, enabled: true, allowedSkills: [{ skillId: 'marketing.research', risk }] },
      ...(input?.second ? [{ assignmentId: 'assignment-b', agentId: 'marketing-b', tenantId, environmentId, portableId, enabled: true, allowedSkills: [{ skillId: 'marketing.research', risk: 'advisory' as const }] }] : []),
    ],
  })
}

function delegationSpy() {
  const calls: any[] = []
  return {
    calls,
    port: {
      async invoke(input: any) {
        calls.push(input)
        return { ok: true, agentId: input.agentId, skillId: input.skillId, risk: 'advisory' as const, mode: 'delegated', data: { kind: 'task' } }
      },
    },
  }
}

test('COS specialist orchestration validates canonical family/skill then delegates exact assigned agent', async () => {
  const spy = delegationSpy()
  const orchestrator = createCOSSpecialistOrchestrator({ registry: registry(), delegation: spy.port })
  const result = await orchestrator.orchestrate({
    tenantId, environmentId, portableId, messageId: 'm-1', text: 'Research the market.',
    plan: { familyId: 'marketing', skillId: 'marketing.research' },
  })
  assert.equal(result.ok, true)
  assert.equal(result.familyId, 'marketing')
  assert.equal(result.selectedAgentId, 'marketing-a')
  assert.equal(spy.calls.length, 1)
  assert.equal(spy.calls[0]?.agentId, 'marketing-a')
  assert.equal(spy.calls[0]?.skillId, 'marketing.research')
})

test('COS specialist orchestration rejects a skill outside the proposed family without delegation', async () => {
  const spy = delegationSpy()
  const orchestrator = createCOSSpecialistOrchestrator({ registry: registry(), delegation: spy.port })
  const result = await orchestrator.orchestrate({
    tenantId, environmentId, portableId, messageId: 'm-2', text: 'Write CRM.',
    plan: { familyId: 'marketing', skillId: 'sales.crm-write' },
  })
  assert.equal(result.mode, 'specialist_skill_not_in_family')
  assert.equal(spy.calls.length, 0)
})

test('COS specialist orchestration fails closed on catalog-to-assignment risk mismatch', async () => {
  const spy = delegationSpy()
  const orchestrator = createCOSSpecialistOrchestrator({ registry: registry({ risk: 'write' }), delegation: spy.port })
  const result = await orchestrator.orchestrate({
    tenantId, environmentId, portableId, messageId: 'm-3', text: 'Research.',
    plan: { familyId: 'marketing', skillId: 'marketing.research' },
  })
  assert.equal(result.mode, 'specialist_risk_mismatch')
  assert.equal(spy.calls.length, 0)
})

test('COS specialist orchestration never silently chooses among multiple eligible agents', async () => {
  const spy = delegationSpy()
  const orchestrator = createCOSSpecialistOrchestrator({ registry: registry({ second: true }), delegation: spy.port })
  const ambiguous = await orchestrator.orchestrate({
    tenantId, environmentId, portableId, messageId: 'm-4', text: 'Research.',
    plan: { familyId: 'marketing', skillId: 'marketing.research' },
  })
  assert.equal(ambiguous.mode, 'specialist_ambiguous')
  assert.equal(spy.calls.length, 0)

  const explicit = await orchestrator.orchestrate({
    tenantId, environmentId, portableId, messageId: 'm-5', text: 'Research.',
    plan: { familyId: 'marketing', skillId: 'marketing.research', agentId: 'marketing-b' },
  })
  assert.equal(explicit.ok, true)
  assert.equal(explicit.selectedAgentId, 'marketing-b')
  assert.equal(spy.calls.length, 1)
})

test('COS specialist orchestration keeps exact buyer scope and unavailable agents fail closed', async () => {
  const spy = delegationSpy()
  const orchestrator = createCOSSpecialistOrchestrator({ registry: registry(), delegation: spy.port })
  const result = await orchestrator.orchestrate({
    tenantId: 'tenant-b', environmentId, portableId, messageId: 'm-6', text: 'Research.',
    plan: { familyId: 'marketing', skillId: 'marketing.research', agentId: 'marketing-a' },
  })
  assert.equal(result.mode, 'specialist_unavailable')
  assert.equal(spy.calls.length, 0)
})
