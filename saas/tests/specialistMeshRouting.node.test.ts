import assert from 'node:assert/strict'
import test from 'node:test'
import { createInMemoryA2AAgentRegistry } from '../a2a-host/a2a-agent-registry.ts'
import { createCOSSpecialistOrchestrator } from '../a2a-host/cos-specialist-orchestrator.ts'
import { rankSpecialistMeshCandidates } from '../a2a-host/specialist-mesh-router.ts'

const scope = { tenantId: 'tenant-a', environmentId: 'prod', portableId: 'portable-marketing' }

function meshRegistry(risk: 'advisory' | 'write' | 'consequential' = 'advisory') {
  return createInMemoryA2AAgentRegistry({
    agents: [
      {
        agentId: 'slow-expensive', displayName: 'Slow Expensive', description: 'specialist', transportRef: 'a', enabled: true,
        advertisedSkillIds: ['marketing.research'],
        metadata: { meshCostScore: 80, meshLoadScore: 70, meshLatencyScore: 80, meshReliabilityScore: 95, meshQualityScore: 95 },
      },
      {
        agentId: 'closest', displayName: 'Closest', description: 'specialist', transportRef: 'b', enabled: true,
        advertisedSkillIds: ['marketing.research'],
        metadata: { meshCostScore: 20, meshLoadScore: 15, meshLatencyScore: 20, meshReliabilityScore: 98, meshQualityScore: 97 },
      },
      {
        agentId: 'busy', displayName: 'Busy', description: 'specialist', transportRef: 'c', enabled: true,
        advertisedSkillIds: ['marketing.research'],
        metadata: { meshCostScore: 10, meshLoadScore: 95, meshLatencyScore: 65, meshReliabilityScore: 90, meshQualityScore: 95 },
      },
    ],
    assignments: ['slow-expensive', 'closest', 'busy'].map(agentId => ({
      assignmentId: `assignment-${agentId}`,
      agentId,
      ...scope,
      enabled: true,
      allowedSkills: [{ skillId: 'marketing.research', risk }],
    })),
  })
}

function qualifications() {
  return { async snapshot(input: { agentIds: readonly string[]; skillId: string }) {
    return Object.fromEntries(input.agentIds.map(agentId => [agentId, { qualified: true, evidenceRef: `db://qualification/${agentId}/${input.skillId}` }]))
  } }
}

test('mesh ranking selects the best cost/load/latency/reliability/quality combination', () => {
  const ranked = rankSpecialistMeshCandidates([
    { agentId: 'a', metadata: { meshCostScore: 80, meshLoadScore: 70, meshLatencyScore: 80, meshReliabilityScore: 95, meshQualityScore: 95 } },
    { agentId: 'b', metadata: { meshCostScore: 20, meshLoadScore: 15, meshLatencyScore: 20, meshReliabilityScore: 98, meshQualityScore: 97 } },
    { agentId: 'c', metadata: { meshCostScore: 10, meshLoadScore: 95, meshLatencyScore: 65, meshReliabilityScore: 90, meshQualityScore: 95 } },
  ])
  assert.equal(ranked[0]?.agentId, 'b')
  assert.ok((ranked[0]?.meshScore ?? 100) < (ranked[1]?.meshScore ?? 0))
})

test('automatic mesh routes to the closest eligible specialist', async () => {
  const calls: string[] = []
  const orchestrator = createCOSSpecialistOrchestrator({
    registry: meshRegistry(), qualifications: qualifications(),
    delegation: { async invoke(input) { calls.push(input.agentId); return { ok: true, agentId: input.agentId, skillId: input.skillId, risk: 'advisory', mode: 'delegated' } } },
  })
  const result = await orchestrator.orchestrate({ ...scope, messageId: 'm-1', text: 'Research.', plan: { familyId: 'marketing', skillId: 'marketing.research' } })
  assert.equal(result.ok, true)
  assert.equal(result.selectedAgentId, 'closest')
  assert.deepEqual(calls, ['closest'])
})

test('advisory mesh fails over to the next eligible specialist after proven transport unavailability', async () => {
  const calls: string[] = []
  const orchestrator = createCOSSpecialistOrchestrator({
    registry: meshRegistry(), qualifications: qualifications(),
    delegation: {
      async invoke(input) {
        calls.push(input.agentId)
        if (input.agentId === 'closest') return { ok: false, agentId: input.agentId, skillId: input.skillId, risk: 'advisory' as const, mode: 'a2a_transport_unavailable', error: 'a2a_http_timeout' }
        return { ok: true, agentId: input.agentId, skillId: input.skillId, risk: 'advisory' as const, mode: 'delegated' }
      },
    },
  })
  const result = await orchestrator.orchestrate({ ...scope, messageId: 'm-2', text: 'Research.', plan: { familyId: 'marketing', skillId: 'marketing.research' } })
  assert.equal(result.ok, true)
  assert.equal(result.selectedAgentId, 'busy')
  assert.deepEqual(result.meshAttemptedAgentIds, ['closest', 'busy'])
  assert.deepEqual(calls, ['closest', 'busy'])
})

test('advisory mesh does not fan out deterministic runtime or application errors', async () => {
  const calls: string[] = []
  const orchestrator = createCOSSpecialistOrchestrator({
    registry: meshRegistry(), qualifications: qualifications(),
    delegation: {
      async invoke(input) {
        calls.push(input.agentId)
        return { ok: false, agentId: input.agentId, skillId: input.skillId, risk: 'advisory' as const, mode: 'a2a_runtime_error', error: 'a2a_response_id_mismatch' }
      },
    },
  })
  const result = await orchestrator.orchestrate({ ...scope, messageId: 'm-2b', text: 'Research.', plan: { familyId: 'marketing', skillId: 'marketing.research' } })
  assert.equal(result.ok, false)
  assert.deepEqual(result.meshAttemptedAgentIds, ['closest'])
  assert.deepEqual(calls, ['closest'])
})

test('automatic mesh does not replay non-advisory work after ambiguous runtime failure', async () => {
  const calls: string[] = []
  const registry = createInMemoryA2AAgentRegistry({
    agents: [
      { agentId: 'write-a', displayName: 'Write A', description: 'specialist', transportRef: 'a', enabled: true, advertisedSkillIds: ['sales.crm-write'], metadata: { meshCostScore: 10 } },
      { agentId: 'write-b', displayName: 'Write B', description: 'specialist', transportRef: 'b', enabled: true, advertisedSkillIds: ['sales.crm-write'], metadata: { meshCostScore: 20 } },
    ],
    assignments: ['write-a', 'write-b'].map(agentId => ({ assignmentId: `assignment-${agentId}`, agentId, ...scope, enabled: true, allowedSkills: [{ skillId: 'sales.crm-write', risk: 'write' as const }] })),
  })
  const orchestrator = createCOSSpecialistOrchestrator({
    registry, qualifications: qualifications(),
    delegation: { async invoke(input) { calls.push(input.agentId); return { ok: false, agentId: input.agentId, skillId: input.skillId, risk: 'write' as const, mode: 'a2a_runtime_error', error: 'timeout after dispatch' } } },
  })
  const result = await orchestrator.orchestrate({ ...scope, messageId: 'm-3', text: 'Update CRM.', plan: { familyId: 'sales', skillId: 'sales.crm-write' }, approval: { approvalId: 'ap-1', approvedBy: 'owner', approvedAt: '2026-09-12T17:00:00.000Z' } })
  assert.equal(result.ok, false)
  assert.deepEqual(calls, ['write-a'])
  assert.deepEqual(result.meshAttemptedAgentIds, ['write-a'])
})
