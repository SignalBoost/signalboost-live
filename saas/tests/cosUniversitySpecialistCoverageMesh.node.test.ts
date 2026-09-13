import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import {
  executeBoundRegisteredSpecialist,
  isBoundRegisteredSpecialistEvidence,
  isRegisteredSpecialistIdentity,
  REGISTERED_SPECIALIST_RUNTIME,
} from '../lib/ai/cos/cosUniversityRegisteredSpecialistExecutor.ts'
import {
  SOFTWARE_CAPSTONE_ROLE,
  SOFTWARE_CAPSTONE_RUNTIME,
  type AgentCapstonePorts,
  type AgentCapstoneRequest,
} from '../lib/ai/cos/cosUniversityAgentCapstone.ts'
import {
  assessmentCarriesBoundExecution,
} from '../lib/ai/cos/cosUniversityAgentGradeEligibility.ts'

const request: AgentCapstoneRequest = {
  agentId: 'cybersecurity-specialist',
  runId: 'aaaaaaaa-1111-4111-8111-111111111111',
  manifestHash: 'a'.repeat(64),
  prompt: 'Assess the supplied case without inventing missing facts.',
}
const answer = 'Evidence is incomplete; verify the missing control state before concluding.'

function ports(role: string, model = 'role-model'): AgentCapstonePorts {
  return {
    readRole: async () => role,
    loadProcedures: async () => ['Separate observed facts from inference.'],
    model,
    commitSha: 'b'.repeat(40),
    deploymentId: 'fixture-deployment',
    infer: async () => answer,
  }
}

test('every declared specialist identity class is executable, but COS and unknown roles are not', () => {
  for (const role of [
    'software_engineering', 'cybersecurity', 'quantitative_data_science',
    'enterprise_operations_governance', 'scientific_physical_systems', 'aerospace_nuclear_safety',
    'molecular_biomedical_sciences', 'neuroscience_biophysics', 'actuarial_insurance_risk',
    'quantum_theoretical_physics',
  ]) assert.equal(isRegisteredSpecialistIdentity(`agent-${role}`, role), true, role)
  assert.equal(isRegisteredSpecialistIdentity('cos', 'cybersecurity'), false)
  assert.equal(isRegisteredSpecialistIdentity('agent-generalist', 'chief_of_staff_generalist'), false)
  assert.equal(isRegisteredSpecialistIdentity('agent-unknown', 'unknown'), false)
})

test('non-software specialist execution binds the exact registered role and never self-awards', async () => {
  const result = await executeBoundRegisteredSpecialist(request, ports('cybersecurity'))
  assert.equal(result.reply, answer)
  assert.equal(result.execution.runtime, REGISTERED_SPECIALIST_RUNTIME)
  assert.equal(result.execution.role, 'cybersecurity')
  assert.equal(result.execution.agentId, request.agentId)
  assert.equal(result.execution.runId, request.runId)
  assert.equal(result.execution.manifestHash, request.manifestHash)
  assert.equal(result.execution.academicAuthority, 'none')
  assert.equal(result.execution.responseHash, createHash('sha256').update(answer).digest('hex'))
  assert.equal(isBoundRegisteredSpecialistEvidence(result.execution, {
    id: request.runId,
    agent_id: request.agentId,
    manifest_hash: request.manifestHash,
    turn_id: result.execution.turnId,
  }, 'cybersecurity', new Date(Date.now() + 1000)), true)
})

test('software keeps its historical runtime instead of relabeling existing evidence', async () => {
  const softwareRequest = { ...request, agentId: 'software-specialist' }
  const result = await executeBoundRegisteredSpecialist(softwareRequest, ports(SOFTWARE_CAPSTONE_ROLE, 'builder-model'))
  assert.equal(result.execution.runtime, SOFTWARE_CAPSTONE_RUNTIME)
  assert.equal(result.execution.role, SOFTWARE_CAPSTONE_ROLE)
  assert.equal(isBoundRegisteredSpecialistEvidence(result.execution, {
    id: softwareRequest.runId,
    agent_id: softwareRequest.agentId,
    manifest_hash: softwareRequest.manifestHash,
    turn_id: result.execution.turnId,
  }, SOFTWARE_CAPSTONE_ROLE, new Date(Date.now() + 1000)), true)
})

test('role, learner, run, manifest, runtime and response tampering fail closed', async () => {
  const result = await executeBoundRegisteredSpecialist(request, ports('cybersecurity'))
  const expected = {
    id: request.runId,
    agent_id: request.agentId,
    manifest_hash: request.manifestHash,
    turn_id: result.execution.turnId,
  }
  for (const [corruption, role] of [
    [{ role: 'quantitative_data_science' }, 'cybersecurity'],
    [{ agentId: 'other-agent' }, 'cybersecurity'],
    [{ runId: 'bbbbbbbb-1111-4111-8111-111111111111' }, 'cybersecurity'],
    [{ manifestHash: 'f'.repeat(64) }, 'cybersecurity'],
    [{ runtime: SOFTWARE_CAPSTONE_RUNTIME }, 'cybersecurity'],
    [{ responseHash: '0'.repeat(64) }, 'cybersecurity'],
  ] as const) {
    assert.equal(isBoundRegisteredSpecialistEvidence({ ...result.execution, ...corruption }, expected, role, new Date(Date.now() + 1000)), false)
  }
  assert.equal(isBoundRegisteredSpecialistEvidence(result.execution, expected, 'quantitative_data_science', new Date(Date.now() + 1000)), false)
})

test('unregistered, generalist and blank-model execution is refused before usable evidence exists', async () => {
  await assert.rejects(executeBoundRegisteredSpecialist(request, ports('chief_of_staff_generalist')), /runtime_unavailable/)
  await assert.rejects(executeBoundRegisteredSpecialist(request, ports('unknown')), /runtime_unavailable/)
  await assert.rejects(executeBoundRegisteredSpecialist(request, ports('cybersecurity', ' ')), /role_model_not_configured/)
})

test('shared grade eligibility accepts exact generic specialist runtime and rejects cross-runtime borrowing', async () => {
  const result = await executeBoundRegisteredSpecialist(request, ports('cybersecurity'))
  assert.equal(assessmentCarriesBoundExecution({ executionProvenance: result.execution }, request.agentId), true)
  assert.equal(assessmentCarriesBoundExecution({ executionProvenance: { ...result.execution, runtime: SOFTWARE_CAPSTONE_RUNTIME } }, request.agentId), false)
  assert.equal(assessmentCarriesBoundExecution({ executionProvenance: { ...result.execution, role: SOFTWARE_CAPSTONE_ROLE } }, request.agentId), false)
})
