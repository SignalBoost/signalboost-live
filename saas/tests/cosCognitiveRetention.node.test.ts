import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { evaluateCognitiveSkillEligibility } from '../lib/ai/cos/cognitiveLearningLifecycle'
import {
  DEFAULT_COGNITIVE_RETENTION_POLICY,
  nextRetentionDueAt,
  retentionIntervalDays,
  shouldWeakenAfterRetentionFailure,
  validationIsStale,
} from '../lib/ai/cos/cognitiveRetentionPolicy'

const strongEvidence = {
  evaluatorApproved: true,
  understandingApproved: true,
  practiceAttempts: 2,
  practiceSuccesses: 2,
  holdoutAttempts: 5,
  holdoutSuccesses: 5,
  distinctHoldoutVariants: 5,
  productionAttempts: 0,
  productionSuccesses: 0,
  failureCount: 0,
  lastValidatedAt: new Date().toISOString(),
}

test('weakened state is sticky despite historical passing evidence', () => {
  const result = evaluateCognitiveSkillEligibility({ ...strongEvidence, weakened: true })
  assert.equal(result.recommendedStatus, 'weakened')
})

test('quarantine remains stronger than weakening', () => {
  const result = evaluateCognitiveSkillEligibility({ ...strongEvidence, weakened: true, quarantined: true })
  assert.equal(result.recommendedStatus, 'quarantined')
})

test('retention cadence stays inside the 30-day validation freshness window', () => {
  assert.equal(retentionIntervalDays('validated'), 14)
  assert.equal(retentionIntervalDays('learned'), 21)
  assert.equal(retentionIntervalDays('mastered'), 30)
  assert.ok(retentionIntervalDays('mastered') <= DEFAULT_COGNITIVE_RETENTION_POLICY.staleValidationDays)
  assert.ok(Date.parse(nextRetentionDueAt('validated', 0)) > 0)
})

test('one retention failure triggers confirmation but two consecutive failures weaken', () => {
  assert.equal(shouldWeakenAfterRetentionFailure(1), false)
  assert.equal(shouldWeakenAfterRetentionFailure(2), true)
})

test('staleness is deterministic and not based on model confidence', () => {
  const now = Date.parse('2026-08-13T06:00:00Z')
  assert.equal(validationIsStale('2026-08-01T06:00:00Z', now), false)
  assert.equal(validationIsStale('2026-06-01T06:00:00Z', now), true)
})

test('database retention evidence cannot manufacture new holdout breadth', () => {
  const here = fileURLToPath(new URL('.', import.meta.url))
  const migration = readFileSync(`${here}../supabase/migrations/20260813_cos_cognitive_retention_consolidation.sql`, 'utf8')
  assert.match(migration, /doesNotIncreaseHoldoutBreadth/) 
  assert.doesNotMatch(migration, /holdout_attempts\s*=\s*holdout_attempts\s*\+/)
  assert.match(migration, /p_contradiction/)
  assert.match(migration, /status = next_status/)
})

test('database guard prevents old counters from silently reviving weakened skills', () => {
  const here = fileURLToPath(new URL('.', import.meta.url))
  const migration = readFileSync(`${here}../supabase/migrations/20260813_cos_cognitive_retention_guard.sql`, 'utf8')
  assert.match(migration, /new\.weakened_at is not null/)
  assert.match(migration, /new\.status := 'weakened'/)
  assert.match(migration, /new\.status := 'quarantined'/)
})
