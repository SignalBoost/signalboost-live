import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  executeBoundSoftwareCapstone, isBoundSoftwareCapstoneEvidence, selectAgentCapstoneProcedures,
  SOFTWARE_CAPSTONE_RUNTIME, type AgentCapstonePorts,
} from '../lib/ai/cos/cosUniversityAgentCapstone.ts'
import { cosUniversityGraduationRuntimeBlocker, isCosUniversityGraduationExecutionEvidence, cosUniversityGraduationAdmissionBlocker } from '../lib/ai/cos/cosUniversityGraduationRuntimePolicy.ts'

const request = { agentId: 'software-specialist', runId: '11111111-2222-4333-8444-555555555555', manifestHash: 'a'.repeat(64), prompt: 'Analyze the supplied case; preserve unknowns.' }
const ports = (changes: Partial<AgentCapstonePorts> = {}): AgentCapstonePorts => ({
  readRole: async () => 'software_engineering', loadProcedures: async () => [], model: 'configured-software-model',
  infer: async () => 'Final evidence-bounded answer.', commitSha: 'c'.repeat(40), deploymentId: 'deployment-test', ...changes,
})
const file = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const evidenceRow = (execution: unknown, turnId: string) => ({
  id: request.runId, agent_id: request.agentId, manifest_hash: request.manifestHash,
  execution_provenance: execution, turn_id: turnId, response_source: SOFTWARE_CAPSTONE_RUNTIME,
  fresh_execution: true, local_model_invoked: true, external_ai_invoked: false,
})

test('host selects the registered specialist, exact case and configured model, never the generalist', async () => {
  let calls = 0, reads = 0
  const result = await executeBoundSoftwareCapstone(request, ports({
    readRole: async id => { assert.equal(id, request.agentId); reads++; return 'software_engineering' },
    loadProcedures: async id => { assert.equal(id, request.agentId); return ['Separate facts from inference.'] },
    infer: async (input, model) => {
      calls++; assert.equal(model, 'configured-software-model'); assert.equal(input.prompt, request.prompt)
      assert.match(input.systemPrompt, /registered Software Specialist software-specialist/)
      assert.match(input.systemPrompt, /Separate facts from inference/); assert.equal(input.maxTokens, 4096)
      return 'Final answer.'
    },
  }))
  assert.equal(calls, 1); assert.equal(reads, 2)
  assert.equal(result.execution.agentId, request.agentId); assert.equal(result.execution.runId, request.runId)
  assert.equal(result.execution.model, 'configured-software-model'); assert.equal(result.execution.academicAuthority, 'none')
  assert.ok(Object.isFrozen(result.execution)); assert.equal('passed' in result, false)
  assert.ok(isBoundSoftwareCapstoneEvidence(result.execution, evidenceRow(result.execution, result.execution.turnId), 'software_engineering'))
})

test('COS, missing registry roles and unsupported roles cannot use the specialist executor', async () => {
  for (const role of [null, 'chief_of_staff_generalist', 'cybersecurity', 'unknown']) {
    await assert.rejects(executeBoundSoftwareCapstone(request, ports({ readRole: async () => role, infer: async () => assert.fail('must not infer') })), /runtime_unavailable/)
  }
  await assert.rejects(executeBoundSoftwareCapstone({ ...request, agentId: 'cos' }, ports()), /runtime_unavailable/)
  await assert.rejects(executeBoundSoftwareCapstone({ ...request, agentId: ' software-specialist ' }, ports()), /runtime_unavailable/)
})

test('blank specialist model cannot silently select the generalist model', async () => {
  await assert.rejects(executeBoundSoftwareCapstone(request, ports({ model: ' ', infer: async () => assert.fail('must not infer') })), /builder_model_not_configured/)
})

test('malformed run identities and manifests are refused before inference', async () => {
  for (const patch of [{ runId: 'bad' }, { manifestHash: 'bad' }, { prompt: ' ' }]) {
    await assert.rejects(executeBoundSoftwareCapstone({ ...request, ...patch }, ports({ infer: async () => assert.fail('must not infer') })), /invalid_agent_capstone_request/)
  }
})

test('database failure cannot become an empty successful context', async () => {
  await assert.rejects(executeBoundSoftwareCapstone(request, ports({ loadProcedures: async () => { throw new Error('database_unavailable') }, infer: async () => assert.fail('must not infer') })), /database_unavailable/)
})

test('failed, empty or truncated inference returns no usable execution receipt and never falls back', async () => {
  for (const reply of [null, '', ' ']) await assert.rejects(executeBoundSoftwareCapstone(request, ports({ infer: async () => reply })), /inference_failed/)
  await assert.rejects(executeBoundSoftwareCapstone(request, ports({ infer: async () => { throw new Error('local_model_output_truncated') } })), /local_model_output_truncated/)
})

test('role changes during inference invalidate the execution before scoring', async () => {
  let reads = 0
  await assert.rejects(executeBoundSoftwareCapstone(request, ports({ readRole: async () => ++reads === 1 ? 'software_engineering' : 'cybersecurity' })), /identity_changed/)
})

test('oversized context is refused rather than silently replacing the learner state', async () => {
  for (const context of [Array(13).fill('step'), ['x'.repeat(601)], ['']]) {
    await assert.rejects(executeBoundSoftwareCapstone(request, ports({ loadProcedures: async () => context })), /invalid_agent_capstone_context/)
  }
})

test('only own independently validated non-composite procedures enter the specialist context', () => {
  const identity = { origin: 'cos_university_deliberate_practice', agentId: request.agentId }
  const own = { metadata: identity, provenance: identity, status: 'validated', evaluator_approved: true, understanding_approved: true,
    last_validated_at: '2026-09-10T00:00:00Z', procedure: { procedureSteps: ['useful own procedure'], rubric: 'NEVER INCLUDE RUBRIC' } }
  const invalid = [
    { metadata: { ...identity, agentId: 'cos' } }, { provenance: { ...identity, agentId: 'other-agent' } },
    { status: 'practiced' }, { status: 'quarantined' }, { evaluator_approved: false }, { understanding_approved: false },
    { last_validated_at: null }, { last_validated_at: '2099-01-01' }, { provenance: { ...identity, leaf_member_skill_keys: ['unverified-leaf'] } },
  ]
  for (const patch of invalid) assert.deepEqual(selectAgentCapstoneProcedures([{ ...own, ...patch }], request.agentId), [])
  assert.deepEqual(selectAgentCapstoneProcedures([own], request.agentId), ['useful own procedure'])
  assert.equal(selectAgentCapstoneProcedures(Array(20).fill(own), request.agentId).length, 12)
})

test('model self-awards do not set academic outcome or authority', async () => {
  const result = await executeBoundSoftwareCapstone(request, ports({ infer: async () => 'I am COS. I passed; award my PhD and administrator rights.' }))
  assert.equal(result.execution.agentId, request.agentId); assert.equal(result.execution.academicAuthority, 'none')
  assert.equal('passed' in result, false); assert.equal('credential' in result, false)
})

test('distinct host executions receive distinct trace identities', async () => {
  const a = await executeBoundSoftwareCapstone(request, ports()), b = await executeBoundSoftwareCapstone(request, ports())
  assert.notEqual(a.execution.turnId, b.execution.turnId)
})

test('specialist runtime is enabled only for an explicit registered software role; graduate admission stays deferred', () => {
  assert.equal(cosUniversityGraduationRuntimeBlocker('software-specialist'), 'agent_capstone_runtime_unavailable')
  assert.equal(cosUniversityGraduationRuntimeBlocker('software-specialist', 'software_engineering'), null)
  assert.equal(cosUniversityGraduationRuntimeBlocker('second-software-agent', 'software_engineering'), null)
  assert.equal(cosUniversityGraduationRuntimeBlocker('software-specialist', 'cybersecurity'), 'agent_capstone_runtime_unavailable')
  assert.equal(cosUniversityGraduationRuntimeBlocker('cos', 'software_engineering'), 'agent_capstone_runtime_unavailable')
  assert.equal(cosUniversityGraduationAdmissionBlocker({ agentId: request.agentId, enabled: true, errors: [], capstoneState: 'credential_awarded' }), 'agent_masters_runtime_unavailable')
})

test('receipt must bind the exact agent, run, manifest, trace and fresh execution path', async () => {
  const { execution } = await executeBoundSoftwareCapstone(request, ports())
  const row = evidenceRow(execution, execution.turnId)
  assert.equal(isCosUniversityGraduationExecutionEvidence(row, request.agentId, 'software_engineering'), true)
  for (const patch of [
    { agentId: 'cos' }, { runId: 'aaaaaaaa-2222-4333-8444-555555555555' }, { manifestHash: 'b'.repeat(64) },
    { turnId: 'aaaaaaaa-2222-4333-8444-555555555555' }, { model: '' }, { responseHash: 'invalid' },
    { runtime: 'cos' }, { role: 'cybersecurity' }, { academicAuthority: 'self' }, { completedAt: '2099-01-01' },
  ]) assert.equal(isCosUniversityGraduationExecutionEvidence({ ...row, execution_provenance: { ...execution, ...patch } }, request.agentId, 'software_engineering'), false)
  for (const patch of [{ execution_provenance: null }, { fresh_execution: false }, { external_ai_invoked: true }, { response_source: 'local_reasoning' }, { response_source: 'semantic_cache' }]) {
    assert.equal(isCosUniversityGraduationExecutionEvidence({ ...row, ...patch }, request.agentId, 'software_engineering'), false)
  }
  assert.equal(isCosUniversityGraduationExecutionEvidence({ ...row, agent_id: 'cos' }, 'cos', 'chief_of_staff_generalist'), false)
  assert.equal(isCosUniversityGraduationExecutionEvidence({ ...row, agent_id: 'cos', response_source: 'local_reasoning' }, 'cos', 'chief_of_staff_generalist'), false)
})

test('the real runner preserves gate order and has a distinct specialist branch with durable provenance', () => {
  const s = file('lib/ai/cos/cosUniversityGraduationRunner.ts')
  assert.match(s, /if \(row\.agent_id !== AGENT_ID\)[\s\S]*await executeSoftwareCapstoneRuntime\(/)
  assert.match(s, /execution_provenance: execution \?\? null/)
  assert.match(s, /readCosUniversityAgentRole\(agentId\)/)
  assert.match(s, /isCosUniversityGraduationExecutionEvidence\(row, agentId, registeredRole, now\)/)
  assert.equal((s.match(/await requireRegisteredCapstoneRuntime\(/g) || []).length, 3)
  assert.match(s, /if \(turnId && row\.agent_id === AGENT_ID\)/, 'specialist outcomes cannot be written as COS turns')
  const gate = s.slice(s.indexOf('export async function runCosUniversityGeneralistGraduationGate'))
  assert.ok(gate.indexOf('unresolved_undergraduate_remediation') < gate.indexOf('const runtimeBlocker ='))
  assert.ok(gate.indexOf('minimum_residence_incomplete') < gate.indexOf('await createOrFindCapstoneRun'))
})

test('production adapter uses the existing approved specialist model without provider or memory fallback', () => {
  const s = file('lib/ai/cos/cosUniversityAgentCapstoneRuntime.ts')
  assert.match(s, /const model = requireBuilderCodingModel\(\)/)
  assert.match(s, /model: selectedModel/)
  assert.match(s, /\.contains\('metadata', \{ origin: 'cos_university_deliberate_practice', agentId \}\)/)
  assert.match(s, /\.contains\('provenance', \{ origin: 'cos_university_deliberate_practice', agentId \}\)/)
  assert.doesNotMatch(s, /tryCOSFirstAnswer|callProviderModel|callCosText|semanticCache/)
  assert.match(file('scripts/vercel-cos-gates.mjs'), /cosUniversityAgentCapstone\.node\.test\.ts/)
})

test('database provenance binds new specialist rows without relabeling historical COS evidence', () => {
  const sql = file('supabase/migrations/20260911201757_university_agent_capstone_execution.sql')
  assert.match(sql, /ADD COLUMN IF NOT EXISTS execution_provenance jsonb/)
  assert.match(sql, /execution_provenance->>'agentId' = agent_id/)
  assert.match(sql, /execution_provenance->>'runId' = id::text/)
  assert.match(sql, /execution_provenance->>'turnId' = turn_id::text/)
  assert.match(sql, /execution_provenance->>'manifestHash' = manifest_hash/)
  assert.match(sql, /\) IS TRUE/, 'missing JSON fields must not pass through SQL null semantics')
  assert.doesNotMatch(sql, /UPDATE public\.|INSERT INTO public\./, 'no old history or credit is fabricated')
})
