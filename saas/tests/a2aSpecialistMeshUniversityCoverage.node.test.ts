import assert from 'node:assert/strict'
import test from 'node:test'
import { A2A_BUYER_MANIFEST_VERSION } from '../a2a-host/a2a-buyer-manifest.ts'
import {
  buildSpecialistMeshCoverageCapabilities,
  decideSpecialistMeshUniversityCoverage,
} from '../a2a-host/specialist-mesh-university-coverage.ts'
import type { ProductionSpecialistBindingDescriptor } from '../a2a-host/a2a-production-specialist-composition.ts'
import type { CosUniversityRegisteredAgent } from '../lib/ai/cos/cosUniversityAgentRegistry.ts'

function binding(agentId: string, skillId = 'software.verify', risk: 'advisory' | 'write' | 'consequential' = 'advisory'): ProductionSpecialistBindingDescriptor {
  return Object.freeze({
    manifest: Object.freeze({
      schemaVersion: A2A_BUYER_MANIFEST_VERSION,
      agentId,
      transportRef: `transport-${agentId}`,
      assignmentId: `assignment-${agentId}`,
      tenantId: 'tenant-a',
      environmentId: 'production',
      portableId: 'portable-a',
      approvedSkills: Object.freeze([Object.freeze({ skillId, risk })]),
    }),
    agentCardUrlEnv: `CARD_${agentId.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`,
    transportEndpointEnv: `ENDPOINT_${agentId.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`,
  })
}

const universityAgents: readonly CosUniversityRegisteredAgent[] = Object.freeze([
  Object.freeze({ agentId: 'software-a', role: 'software_engineering' }),
  Object.freeze({ agentId: 'software-b', role: 'software_engineering' }),
  Object.freeze({ agentId: 'quant-a', role: 'quantitative_data_science' }),
])

test('coverage capabilities group exact scope/skill/risk and distinct authorized agents', () => {
  const rows = buildSpecialistMeshCoverageCapabilities([
    binding('software-a'),
    binding('software-b'),
  ])
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0].authorizedAgentIds, ['software-a', 'software-b'])
  assert.equal(rows[0].skillId, 'software.verify')
  assert.equal(rows[0].subjectId, 'computer_science')
  assert.equal(rows[0].risk, 'advisory')
})

test('one qualified agent creates deterministic cross-training priority for an authorized learner', () => {
  const [capability] = buildSpecialistMeshCoverageCapabilities([binding('software-a'), binding('software-b')])
  const decision = decideSpecialistMeshUniversityCoverage({
    capability,
    qualificationEvidence: {
      'software-a': { qualified: true, evidenceRef: 'evidence://software-a' },
    },
    registeredAgents: universityAgents,
  })
  assert.equal(decision.status, 'training_priority')
  assert.equal(decision.candidateAgentId, 'software-b')
  assert.equal(decision.candidateAuthorized, true)
  assert.deepEqual(decision.qualifiedAuthorizedAgentIds, ['software-a'])
  assert.equal(decision.targetQualifiedCount, 2)
})

test('two independently qualified authorized agents resolve the coverage gap', () => {
  const [capability] = buildSpecialistMeshCoverageCapabilities([binding('software-a'), binding('software-b')])
  const decision = decideSpecialistMeshUniversityCoverage({
    capability,
    qualificationEvidence: {
      'software-a': { qualified: true, evidenceRef: 'evidence://a' },
      'software-b': { qualified: true, evidenceRef: 'evidence://b' },
    },
    registeredAgents: universityAgents,
  })
  assert.equal(decision.status, 'covered')
  assert.equal(decision.candidateAgentId, null)
  assert.deepEqual(decision.qualifiedAuthorizedAgentIds, ['software-a', 'software-b'])
})

test('qualified but unauthorized role-fit learner is an authorization gap, not a restudy request', () => {
  const [capability] = buildSpecialistMeshCoverageCapabilities([binding('external-a')])
  const decision = decideSpecialistMeshUniversityCoverage({
    capability,
    qualificationEvidence: {
      'external-a': { qualified: true, evidenceRef: 'evidence://external-a' },
      'software-a': { qualified: true, evidenceRef: 'evidence://software-a' },
    },
    registeredAgents: universityAgents,
  })
  assert.equal(decision.status, 'authorization_gap')
  assert.equal(decision.candidateAgentId, 'software-a')
  assert.equal(decision.candidateAuthorized, false)
})

test('role-fit University learner may be cross-trained without receiving authorization', () => {
  const [capability] = buildSpecialistMeshCoverageCapabilities([binding('external-a')])
  const decision = decideSpecialistMeshUniversityCoverage({
    capability,
    qualificationEvidence: {
      'external-a': { qualified: true, evidenceRef: 'evidence://external-a' },
    },
    registeredAgents: universityAgents,
  })
  assert.equal(decision.status, 'training_priority')
  assert.equal(decision.candidateAgentId, 'software-a')
  assert.equal(decision.candidateAuthorized, false)
})

test('unrelated University roles do not become training candidates', () => {
  const [capability] = buildSpecialistMeshCoverageCapabilities([binding('external-a')])
  const decision = decideSpecialistMeshUniversityCoverage({
    capability,
    qualificationEvidence: {
      'external-a': { qualified: true, evidenceRef: 'evidence://external-a' },
    },
    registeredAgents: Object.freeze([Object.freeze({ agentId: 'quant-a', role: 'quantitative_data_science' })]),
  })
  assert.equal(decision.status, 'unassigned')
  assert.equal(decision.candidateAgentId, null)
})

test('duplicate evidence cannot inflate independent qualified-agent coverage', () => {
  const [capability] = buildSpecialistMeshCoverageCapabilities([binding('software-a'), binding('software-b')])
  const decision = decideSpecialistMeshUniversityCoverage({
    capability,
    qualificationEvidence: {
      'software-a': { qualified: true, evidenceRef: 'same-agent-latest-only' },
    },
    registeredAgents: universityAgents,
  })
  assert.equal(decision.qualifiedAuthorizedAgentIds.length, 1)
  assert.equal(decision.status, 'training_priority')
})

test('write and consequential gaps receive higher education priority without changing authority', () => {
  const [advisory] = buildSpecialistMeshCoverageCapabilities([binding('external-a', 'software.verify', 'advisory')])
  const [write] = buildSpecialistMeshCoverageCapabilities([binding('external-a', 'software.build', 'write')])
  const [consequential] = buildSpecialistMeshCoverageCapabilities([binding('external-a', 'self-healing.apply-remediation', 'consequential')])
  const evidence = { 'external-a': { qualified: true, evidenceRef: 'evidence://external-a' } }
  const a = decideSpecialistMeshUniversityCoverage({ capability: advisory, qualificationEvidence: evidence, registeredAgents: universityAgents })
  const w = decideSpecialistMeshUniversityCoverage({ capability: write, qualificationEvidence: evidence, registeredAgents: universityAgents })
  const c = decideSpecialistMeshUniversityCoverage({ capability: consequential, qualificationEvidence: evidence, registeredAgents: universityAgents })
  assert.ok(w.priority > a.priority)
  assert.ok(c.priority > w.priority)
  assert.equal(a.candidateAuthorized, false)
  assert.equal(w.candidateAuthorized, false)
  assert.equal(c.candidateAuthorized, false)
})
