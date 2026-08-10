import assert from 'node:assert/strict'
import test from 'node:test'
import { assessCOSIndependence } from '../lib/cos-core/layers/autonomy/independence'
import { measureLearningQuality } from '../lib/cos-core/layers/learning/quality'

test('strict COS independence requires local primary and no cloud credentials', () => {
  const result = assessCOSIndependence({
    LOCAL_AI_BASE_URL: 'http://localhost:11434/v1',
    AI_MODEL_PROVIDER: 'local',
    LOCAL_AI_ALLOW_CLOUD_FALLBACK: 'false',
  })
  assert.equal(result.strictProviderIndependent, true)
  assert.equal(result.score, 100)
})

test('cloud credentials prevent zero-cloud proof mode', () => {
  const result = assessCOSIndependence({
    LOCAL_AI_BASE_URL: 'http://localhost:11434/v1', AI_MODEL_PROVIDER: 'local', OPENAI_API_KEY: 'present',
  })
  assert.equal(result.strictProviderIndependent, false)
  assert.ok(result.blockers.some((blocker) => blocker.includes('keys')))
})

test('learning quality reports improvement across observation windows', () => {
  const report = measureLearningQuality([
    { strategy: 'a', succeeded: false, latencyMs: 10000, externalCostUsd: 0.02, createdAt: '2026-01-01' },
    { strategy: 'a', succeeded: true, latencyMs: 9000, externalCostUsd: 0.02, createdAt: '2026-01-02' },
    { strategy: 'b', succeeded: true, latencyMs: 1000, externalCostUsd: 0, createdAt: '2026-01-03' },
    { strategy: 'b', succeeded: true, latencyMs: 800, externalCostUsd: 0, createdAt: '2026-01-04' },
  ])
  assert.equal(report.improving, true)
  assert.ok(report.recentScore > report.baselineScore)
})
