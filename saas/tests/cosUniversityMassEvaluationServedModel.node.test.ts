// saas/tests/cosUniversityMassEvaluationServedModel.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { servedCandidateModelFromCanary } from '../lib/ai/cos/cosUniversityMassEvaluationServedModel.ts'

const hash = '7f23dde56e39a6bc0b279843ec31980a0c4a3c6c4b46975a24128dfd4caab976'
const input = { candidateId: 'mass:55944547-534f-421e-9a7a-bc4f5422a8f6:a0f127c24b687206', artifactHash: hash, endpointId: 'q80vo24huabvp6' }
const passed = (evidence: Record<string, unknown>, observed_at = '2026-09-16T12:00:00Z') => ({
  verifier: 'host_controller', observed_at,
  evidence: { claim: 'local_distilled_runtime_canary_passed', exactArtifact: true, candidateId: input.candidateId, artifactHash: hash, endpointId: input.endpointId, model: 'itmounts-mass-distilled-7f23dde56e39-a1b2c3d4e5', ...evidence },
})

test('uses the runtime-keyed name the passing canary proved, not the bare hash name that 404s', () => {
  assert.equal(servedCandidateModelFromCanary([passed({})], input), 'itmounts-mass-distilled-7f23dde56e39-a1b2c3d4e5')
})

test('picks the newest valid proof for this endpoint and ignores unrelated endpoint failures', () => {
  const events = [
    passed({ model: 'itmounts-mass-distilled-7f23dde56e39-old0000000' }, '2026-09-15T12:00:00Z'),
    passed({ model: 'itmounts-mass-distilled-7f23dde56e39-new0000000' }, '2026-09-16T12:00:00Z'),
    passed({ model: 'itmounts-mass-distilled-7f23dde56e39-otherendpt', endpointId: 'zzzz' }, '2026-09-17T00:00:00Z'),
    passed({ model: 'itmounts-mass-distilled-7f23dde56e39-failed0000', claim: 'local_distilled_runtime_canary_failed', endpointId: 'zzzz' }, '2026-09-17T00:00:00Z'),
  ]
  assert.equal(servedCandidateModelFromCanary(events, input), 'itmounts-mass-distilled-7f23dde56e39-new0000000')
})

test('fails closed when a newer canary failure invalidates the previously proven endpoint', () => {
  const events = [
    passed({ model: 'itmounts-mass-distilled-7f23dde56e39-good000000' }, '2026-09-16T12:00:00Z'),
    passed({
      model: 'itmounts-mass-distilled-7f23dde56e39-good000000',
      claim: 'local_distilled_runtime_canary_failed',
      exactArtifact: false,
      error: 'mass_distilled_runtime_worker_not_ready',
    }, '2026-09-16T13:00:00Z'),
  ]
  assert.throws(() => servedCandidateModelFromCanary(events, input), /served_model_unproven/)
})

test('an older failed canary does not invalidate a newer passing proof', () => {
  const events = [
    passed({
      model: 'itmounts-mass-distilled-7f23dde56e39-oldfail0000',
      claim: 'local_distilled_runtime_canary_failed',
      exactArtifact: false,
    }, '2026-09-16T11:00:00Z'),
    passed({ model: 'itmounts-mass-distilled-7f23dde56e39-good000000' }, '2026-09-16T12:00:00Z'),
  ]
  assert.equal(servedCandidateModelFromCanary(events, input), 'itmounts-mass-distilled-7f23dde56e39-good000000')
})

test('fails closed without exact proof: no canary, wrong verifier, foreign model name, or not exactArtifact', () => {
  assert.throws(() => servedCandidateModelFromCanary([], input), /mass_distilled_evaluation_served_model_unproven/)
  assert.throws(() => servedCandidateModelFromCanary([{ ...passed({}), verifier: 'someone' }], input), /served_model_unproven/)
  assert.throws(() => servedCandidateModelFromCanary([passed({ model: 'Qwen/Qwen3-4B' })], input), /served_model_unproven/)
  assert.throws(() => servedCandidateModelFromCanary([passed({ model: 'itmounts-mass-distilled-8cea7b8f0000-x' })], input), /served_model_unproven/)
  assert.throws(() => servedCandidateModelFromCanary([passed({ exactArtifact: false })], input), /served_model_unproven/)
})

test('the runner resolves the candidate model from canary proof', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')
  assert.match(source, /const model=await servedCandidateModel\(\{\.\.\.input\.claim,attentionArchitecture:training\.attentionArchitecture,xsaProfile:training\.xsaProfile\}\)/)
  assert.doesNotMatch(source, /const model=candidateModelName\(/)
})

// 2026-09-27 (mass:dabe6783): the canary lane records the serving architecture on its companion
// production_canary_healthy record, not on the passed record. An exclusive-self-attention artifact therefore
// failed served_model_unproven three times before any question was asked.
const xsaInput = { ...input, attentionArchitecture: 'exclusive_self_attention_v1', xsaProfile: 'qwen3_xsa_projection_v1' }
const companion = (evidence: Record<string, unknown>, observed_at = '2026-09-16T12:00:05Z') => ({
  verifier: 'host_production_verifier', observed_at,
  evidence: {
    claim: 'production_canary_healthy', exactArtifact: true, candidateId: input.candidateId, artifactHash: hash, endpointId: input.endpointId,
    attentionArchitecture: 'exclusive_self_attention_v1', xsaProfile: 'qwen3_xsa_projection_v1', servingRuntime: 'transformers_xsa', ...evidence,
  },
})

test('an XSA artifact is proven by the companion production canary written in the same step', () => {
  assert.equal(servedCandidateModelFromCanary([passed({}), companion({})], xsaInput), 'itmounts-mass-distilled-7f23dde56e39-a1b2c3d4e5')
})

test('an XSA artifact still fails closed without architecture proof, or with proof from the wrong place', () => {
  assert.throws(() => servedCandidateModelFromCanary([passed({})], xsaInput), /served_model_unproven/)
  assert.throws(() => servedCandidateModelFromCanary([passed({}), companion({ servingRuntime: 'vllm' })], xsaInput), /served_model_unproven/)
  assert.throws(() => servedCandidateModelFromCanary([passed({}), companion({ endpointId: 'otherendpoint' })], xsaInput), /served_model_unproven/)
  assert.throws(() => servedCandidateModelFromCanary([passed({}), { ...companion({}), verifier: 'host_controller' }], xsaInput), /served_model_unproven/)
  assert.throws(() => servedCandidateModelFromCanary([passed({}), companion({}, '2026-09-16T14:00:00Z')], xsaInput), /served_model_unproven/)
})

test('a standard-attention artifact is not satisfied by an XSA canary', () => {
  assert.throws(() => servedCandidateModelFromCanary([passed({}), companion({})].map(row => row.verifier === 'host_controller'
    ? { ...row, evidence: { ...row.evidence, attentionArchitecture: 'exclusive_self_attention_v1' } } : row), input), /served_model_unproven/)
})
