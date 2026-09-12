import assert from 'node:assert/strict'
import test from 'node:test'
import { createInMemoryA2AAgentRegistry } from '../a2a-host/a2a-agent-registry.ts'
import { createCOSSpecialistOrchestrator } from '../a2a-host/cos-specialist-orchestrator.ts'
import { rankSpecialistMeshCandidates } from '../a2a-host/specialist-mesh-router.ts'

const scope = { tenantId: 'tenant-a', environmentId: 'prod', portableId: 'portable-marketing' }
const qualifications = { async snapshot(input: { agentIds: readonly string[]; skillId: string }) {
  return Object.fromEntries(input.agentIds.map(agentId => [agentId, { qualified: true, evidenceRef: `db://qualification/${agentId}/${input.skillId}` }]))
} }

test('live signals override stale static routing metadata without changing eligibility', () => {
  const ranked = rankSpecialistMeshCandidates([
    { agentId: 'a', metadata: { meshCostScore: 10, meshLoadScore: 10, meshLatencyScore: 10, meshReliabilityScore: 99, meshQualityScore: 99 } },
    { agentId: 'b', metadata: { meshCostScore: 80, meshLoadScore: 80, meshLatencyScore: 80, meshReliabilityScore: 90, meshQualityScore: 90 } },
  ], {
    a: { available: false },
    b: { costScore: 15, loadScore: 10, latencyScore: 10, reliabilityScore: 99, qualityScore: 99 },
  })
  assert.deepEqual(ranked.map(candidate => candidate.agentId), ['b'])
})

test('orchestrator uses live mesh telemetry only after exact authorization and qualification gates', async () => {
  const registry = createInMemoryA2AAgentRegistry({
    agents: [
      { agentId: 'a', displayName: 'A', description: 'specialist', transportRef: 'a', enabled: true, advertisedSkillIds: ['marketing.research'], metadata: { meshCostScore: 5 } },
      { agentId: 'b', displayName: 'B', description: 'specialist', transportRef: 'b', enabled: true, advertisedSkillIds: ['marketing.research'], metadata: { meshCostScore: 90 } },
    ],
    assignments: ['a', 'b'].map(agentId => ({ assignmentId: `assignment-${agentId}`, agentId, ...scope, enabled: true, allowedSkills: [{ skillId: 'marketing.research', risk: 'advisory' as const }] })),
  })
  const calls: string[] = []
  const observed: string[][] = []
  const orchestrator = createCOSSpecialistOrchestrator({
    registry, qualifications,
    meshSignals: {
      async snapshot(input) {
        observed.push([...input.agentIds])
        return { a: { available: false }, b: { costScore: 10, loadScore: 10, latencyScore: 10, reliabilityScore: 99, qualityScore: 99 } }
      },
    },
    delegation: { async invoke(input) { calls.push(input.agentId); return { ok: true, agentId: input.agentId, skillId: input.skillId, risk: 'advisory' as const, mode: 'delegated' } } },
  })
  const result = await orchestrator.orchestrate({ ...scope, messageId: 'm-live', text: 'Research.', plan: { familyId: 'marketing', skillId: 'marketing.research' } })
  assert.equal(result.selectedAgentId, 'b')
  assert.deepEqual(calls, ['b'])
  assert.deepEqual(observed, [['a', 'b']])
})

test('telemetry failure degrades to safe static routing instead of blocking a qualified specialist', async () => {
  const registry = createInMemoryA2AAgentRegistry({
    agents: [{ agentId: 'a', displayName: 'A', description: 'specialist', transportRef: 'a', enabled: true, advertisedSkillIds: ['marketing.research'], metadata: { meshCostScore: 1 } }],
    assignments: [{ assignmentId: 'assignment-a', agentId: 'a', ...scope, enabled: true, allowedSkills: [{ skillId: 'marketing.research', risk: 'advisory' as const }] }],
  })
  const orchestrator = createCOSSpecialistOrchestrator({
    registry, qualifications,
    meshSignals: { async snapshot() { throw new Error('telemetry unavailable') } },
    delegation: { async invoke(input) { return { ok: true, agentId: input.agentId, skillId: input.skillId, risk: 'advisory' as const, mode: 'delegated' } } },
  })
  const result = await orchestrator.orchestrate({ ...scope, messageId: 'm-fallback', text: 'Research.', plan: { familyId: 'marketing', skillId: 'marketing.research' } })
  assert.equal(result.ok, true)
  assert.equal(result.selectedAgentId, 'a')
})
