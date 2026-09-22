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
