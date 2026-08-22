import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildReasoningWorkerMetric,
  estimateReasoningCostUsd,
  estimateTextTokens,
} from '../lib/ai/cos/reasoningWorkerMetrics.ts'

test('token estimates are deterministic and never store text', () => {
  assert.equal(estimateTextTokens(''), 0)
  assert.equal(estimateTextTokens('12345678'), 2)
  const metric = buildReasoningWorkerMetric({
    turnId: '11111111-1111-4111-8111-111111111111',
    problemClass: 'code and implementation',
    workerRole: 'coder',
    reasonerLabel: 'managed-open-model:deepinfra:model',
    latencyMs: 1234,
    prompt: 'secret prompt text',
    systemPrompt: 'system contract',
    response: 'secret answer text',
  })
  assert.equal(metric.workerRole, 'coder')
  assert.equal(metric.latencyMs, 1234)
  assert.ok(!Object.values(metric).includes('secret prompt text'))
  assert.ok(!Object.values(metric).includes('secret answer text'))
})

test('monetary cost is null until explicit provider pricing is configured', () => {
  const previousInput = process.env.LOCAL_AI_INPUT_COST_PER_MILLION
  const previousOutput = process.env.LOCAL_AI_OUTPUT_COST_PER_MILLION
  delete process.env.LOCAL_AI_INPUT_COST_PER_MILLION
  delete process.env.LOCAL_AI_OUTPUT_COST_PER_MILLION
  assert.deepEqual(estimateReasoningCostUsd(1000, 500), { costUsd: null, pricingConfigured: false })
  if (previousInput === undefined) delete process.env.LOCAL_AI_INPUT_COST_PER_MILLION
  else process.env.LOCAL_AI_INPUT_COST_PER_MILLION = previousInput
  if (previousOutput === undefined) delete process.env.LOCAL_AI_OUTPUT_COST_PER_MILLION
  else process.env.LOCAL_AI_OUTPUT_COST_PER_MILLION = previousOutput
})

test('configured per-million rates produce an auditable estimated cost', () => {
  const previousInput = process.env.LOCAL_AI_INPUT_COST_PER_MILLION
  const previousOutput = process.env.LOCAL_AI_OUTPUT_COST_PER_MILLION
  process.env.LOCAL_AI_INPUT_COST_PER_MILLION = '2'
  process.env.LOCAL_AI_OUTPUT_COST_PER_MILLION = '6'
  const estimate = estimateReasoningCostUsd(1_000_000, 500_000)
  assert.equal(estimate.pricingConfigured, true)
  assert.equal(estimate.costUsd, 5)
  if (previousInput === undefined) delete process.env.LOCAL_AI_INPUT_COST_PER_MILLION
  else process.env.LOCAL_AI_INPUT_COST_PER_MILLION = previousInput
  if (previousOutput === undefined) delete process.env.LOCAL_AI_OUTPUT_COST_PER_MILLION
  else process.env.LOCAL_AI_OUTPUT_COST_PER_MILLION = previousOutput
})
