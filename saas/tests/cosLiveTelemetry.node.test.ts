import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCosLiveTelemetry } from '../lib/ai/cos/cosLiveTelemetry.ts'

test('semantic reuse records avoided local/external calls and estimated savings', () => {
  const observation = buildCosLiveTelemetry({
    responseSource: 'semantic_similarity',
    latencyMs: 18,
    confidence: 0.91,
    reasonerLabel: 'independent-local:qwen-test',
    localModelInvoked: false,
    externalAiInvoked: false,
    knowledgeFactsUsed: 2,
    learnedItemsUsed: 1,
    userMemoriesUsed: 0,
    similarityScore: 0.96,
    promptChars: 400,
    replyChars: 800,
  }, '2026-08-11T19:00:00-06:00')

  assert.equal(observation.inferenceAvoided, true)
  assert.equal(observation.localCallsAvoided, 1)
  assert.equal(observation.externalCallsAvoided, 1)
  assert.equal(observation.estimatedInputTokensAvoided, 100)
  assert.equal(observation.estimatedOutputTokensAvoided, 200)
  assert.equal(observation.estimatedExternalTokensAvoided, 300)
  assert.ok(observation.estimatedExternalCostAvoidedUsd > 0)
})

test('external fallback never claims external cost avoidance', () => {
  const observation = buildCosLiveTelemetry({
    responseSource: 'external_fallback',
    latencyMs: 1200,
    confidence: 0.5,
    reasonerLabel: 'independent-local:qwen-test',
    localModelInvoked: true,
    externalAiInvoked: true,
    promptChars: 400,
    replyChars: 800,
  })

  assert.equal(observation.inferenceAvoided, false)
  assert.equal(observation.localCallsAvoided, 0)
  assert.equal(observation.externalCallsAvoided, 0)
  assert.equal(observation.estimatedExternalTokensAvoided, 0)
  assert.equal(observation.estimatedExternalCostAvoidedUsd, 0)
})
