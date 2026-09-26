import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { classifyProviderFailure } from '../lib/supervisor/provider-circuit.ts'

const ROOT = path.resolve(process.cwd())

test('provider circuit classifies deterministic capacity failures without paid retry', () => {
  const result = classifyProviderFailure(['Bad request', 'Private repository storage limit reached, please upgrade your plan'])
  assert.equal(result.failureClass, 'capacity_exhausted')
  assert.equal(result.disposition, 'open_circuit')
  assert.equal(result.deterministic, true)
  assert.equal(result.costBearingRetryAllowed, false)
})

test('provider circuit handles auth, billing, rate limit and transient transport independently', () => {
  assert.equal(classifyProviderFailure(['401 invalid token']).failureClass, 'authentication_failed')
  assert.equal(classifyProviderFailure(['payment required; billing limit reached']).failureClass, 'billing_exhausted')
  assert.equal(classifyProviderFailure(['429 too many requests']).disposition, 'backoff')
  const transient = classifyProviderFailure(['connection reset by peer'])
  assert.equal(transient.disposition, 'retry_bounded')
  assert.equal(transient.costBearingRetryAllowed, true)
})

test('unknown provider failures fail closed for cost-bearing retry', () => {
  const result = classifyProviderFailure(['new provider-specific terminal condition'])
  assert.equal(result.failureClass, 'unknown')
  assert.equal(result.disposition, 'protected_halt')
  assert.equal(result.costBearingRetryAllowed, false)
})

test('mass distillation checks the universal circuit before any campaign claim', () => {
  const source = fs.readFileSync(path.join(ROOT, 'lib/ai/cos/cosUniversityMassDistillationConsumer.ts'), 'utf8')
  const circuitAt = source.indexOf("readProviderCircuit({ db, providerId: 'huggingface', capability: 'model-training' })")
  const claimAt = source.indexOf("db.rpc('claim_cos_university_mass_distillation_stage'")
  assert.ok(circuitAt >= 0 && claimAt > circuitAt)
  assert.match(source, /reason: 'provider_circuit_open'/)
  assert.match(source, /externalCostUsd: 0/)
})

test('successful durable artifact callback closes only the recovered provider capability circuit', () => {
  const source = fs.readFileSync(path.join(ROOT, 'lib/ai/cos/cosUniversityMassDistillationConsumer.ts'), 'utf8')
  assert.match(source, /closeProviderCircuit\(\{[\s\S]*providerId: 'huggingface'[\s\S]*capability: 'model-training'/)
  assert.match(source, /claim === 'trained_artifact_registered'/)
})


test('half-open provider recovery is one-shot and consumed before paid dispatch', () => {
  const circuitSource = fs.readFileSync(path.join(ROOT, 'lib/supervisor/provider-circuit.ts'), 'utf8')
  const consumerSource = fs.readFileSync(path.join(ROOT, 'lib/ai/cos/cosUniversityMassDistillationConsumer.ts'), 'utf8')
  assert.match(circuitSource, /consumeProviderCircuitRecoveryProbe/)
  assert.match(circuitSource, /cost_bearing_retry_allowed: false/)
  assert.match(circuitSource, /\.eq\('cost_bearing_retry_allowed', true\)/)
  assert.match(consumerSource, /const recoveryProbeArmed = providerCircuit\.open && providerCircuit\.costBearingRetryAllowed === true/)
  assert.match(consumerSource, /const maxDispatches = recoveryProbeArmed[\s\S]*\? 1/)
  const consumeAt = consumerSource.indexOf('consumeProviderCircuitRecoveryProbe({')
  const dispatchAt = consumerSource.indexOf('dispatchClaim(claim, input.fetchImpl)')
  assert.ok(consumeAt >= 0 && dispatchAt > consumeAt)
})


test('storage recovery is read-only verified before one paid half-open dispatch is armed', () => {
  const circuitSource = fs.readFileSync(path.join(ROOT, 'lib/supervisor/provider-circuit.ts'), 'utf8')
  const diagnosticsSource = fs.readFileSync(path.join(ROOT, 'lib/ai/cos/cosUniversityHuggingFaceJobDiagnostics.ts'), 'utf8')
  const workflowSource = fs.readFileSync(path.join(ROOT, 'lib/ai/cos/cosUniversityMassDistillationWorkflow.ts'), 'utf8')
  assert.match(circuitSource, /armProviderCircuitRecoveryProbe/)
  assert.match(circuitSource, /cost_bearing_retry_allowed: true/)
  assert.match(circuitSource, /state: 'half_open_probe_armed'/)
  assert.match(diagnosticsSource, /recoverHuggingFaceStorageCapacityCircuit/)
  assert.match(diagnosticsSource, /classification\.failureClass === 'capacity_exhausted'/)
  assert.match(diagnosticsSource, /classification\.reason === 'provider_storage_capacity_exhausted'/)
  assert.match(diagnosticsSource, /maxPaidVerificationDispatches: 1/)
  assert.match(workflowSource, /provider_storage_recovery/)
  assert.match(workflowSource, /recoverHuggingFaceStorageCapacityCircuit\(\{ maxJobs: 3, now \}\)/)
})


test('signed Working COS or University training success closes the universal HF model-training circuit', () => {
  const source = fs.readFileSync(path.join(ROOT, 'app/api/internal/cos/university-training-executor/evidence/route.ts'), 'utf8')
  assert.match(source, /body\.claim === 'trained_artifact_registered'/)
  assert.match(source, /closeProviderCircuit\(\{/)
  assert.match(source, /providerId: 'huggingface'/)
  assert.match(source, /capability: 'model-training'/)
  assert.match(source, /training_executor_success_closes_provider_circuit_v1/)
  assert.doesNotMatch(source, /automaticPromotionAuthorized:\s*true|productionTrafficAuthorized:\s*true/)
})


test('deterministic University worker exceptions do not classify Hugging Face as unavailable', () => {
  const result = classifyProviderFailure([
    'File "/tmp/itmounts_hf_worker.py", line 1158, in train_student',
    "KeyError: 'xsaInstalledAttentionLayers'",
  ])
  assert.equal(result.failureClass, 'configuration_invalid')
  assert.equal(result.reason, 'worker_contract_invalid')
  assert.equal(result.deterministic, true)
  assert.equal(result.costBearingRetryAllowed, false)

  const diagnostics = fs.readFileSync(path.join(ROOT, 'lib/ai/cos/cosUniversityHuggingFaceJobDiagnostics.ts'), 'utf8')
  assert.match(diagnostics, /classification\.reason === 'worker_contract_invalid'/)
  assert.match(diagnostics, /worker_failure_not_provider_scoped/)
})
