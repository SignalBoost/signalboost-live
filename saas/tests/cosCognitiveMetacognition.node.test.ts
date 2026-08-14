import test from 'node:test'
import assert from 'node:assert/strict'
import { assessCapabilityRegion, assessSkillSelection } from '../lib/ai/cos/cognitiveMetacognition.ts'

test('unhealthy composite dependency is never selectable despite high similarity', () => {
  const result = assessSkillSelection({ status: 'mastered', similarity: 0.99, productionAttempts: 20, productionSuccesses: 20, retentionAttempts: 5, retentionSuccesses: 5, failureCount: 0, dependencyHealthy: false })
  assert.equal(result.eligible, false)
  assert.equal(result.selectionScore, 0)
})

test('verified outcome history can break close semantic ties', () => {
  const reliable = assessSkillSelection({ status: 'learned', similarity: 0.76, productionAttempts: 10, productionSuccesses: 10, retentionAttempts: 5, retentionSuccesses: 5, failureCount: 0, dependencyHealthy: true })
  const fragile = assessSkillSelection({ status: 'learned', similarity: 0.78, productionAttempts: 10, productionSuccesses: 6, retentionAttempts: 5, retentionSuccesses: 3, failureCount: 8, dependencyHealthy: true })
  assert.equal(reliable.eligible, true)
  assert.ok(reliable.selectionScore > fragile.selectionScore)
  assert.ok(reliable.evidenceReliability > fragile.evidenceReliability)
})

test('metacognition marks unresolved capability without strong skills as weak', () => {
  const result = assessCapabilityRegion({ strongSkills: 0, weakenedSkills: 0, quarantinedSkills: 0, unresolvedGaps: 3, productionAttempts: 0, productionSuccesses: 0, retentionAttempts: 0, retentionSuccesses: 0, failureCount: 0 })
  assert.equal(result.region, 'weak')
})

test('strong and quarantined procedures make a capability conflicted', () => {
  const result = assessCapabilityRegion({ strongSkills: 1, weakenedSkills: 0, quarantinedSkills: 1, unresolvedGaps: 0, productionAttempts: 5, productionSuccesses: 5, retentionAttempts: 2, retentionSuccesses: 2, failureCount: 1 })
  assert.equal(result.region, 'conflicted')
})

test('capability reliability is evidence metadata, not answer confidence', () => {
  const result = assessCapabilityRegion({ strongSkills: 2, weakenedSkills: 0, quarantinedSkills: 0, unresolvedGaps: 0, productionAttempts: 10, productionSuccesses: 10, retentionAttempts: 5, retentionSuccesses: 5, failureCount: 0 })
  assert.equal(result.region, 'strong')
  assert.ok(result.reliability > 0.7)
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'confidence'), false)
})
