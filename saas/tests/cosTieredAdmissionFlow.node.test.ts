// saas/tests/cosTieredAdmissionFlow.node.test.ts
//
// Pins the two properties the first tier wiring got wrong:
//   1. REACHABILITY — a borderline candidate (confidence 0.65-0.72) must actually reach the
//      probationary path under the LIVE policy floor (0.72), instead of dying at confidence_too_low.
//   2. NO TIGHTENING — a candidate that clears every standing floor must be admitted exactly as
//      before tiers existed, never deferred or tier-rejected because its coverage is modest.
import assert from 'node:assert/strict'
import test from 'node:test'
import { ContinuousLearningDirector, type ContinuousLearningStore, type LearningCandidate } from '../lib/cos-core/layers/learning/index.ts'
import { classifyTieredAdmission, PROBATIONARY_MINIMUM_CONFIDENCE } from '../lib/ai/cos/tieredLearningAdmission.ts'

function candidate(overrides: Partial<LearningCandidate> = {}): LearningCandidate {
  const confidence = overrides.confidence ?? 0.66
  return {
    contentHash: `hash-${Math.random()}`,
    sourceKind: 'scientific_journal',
    sourceUri: 'https://journal.example.test/a',
    observedAt: '2026-08-18T00:00:00.000Z',
    subject: 'sensor fusion',
    summary: 'A summary about sensor fusion.',
    facts: [{ predicate: 'source_excerpt', object: 'A summary about sensor fusion.', confidence }],
    confidence,
    evidence: ['https://journal.example.test/a'],
    ...overrides,
  }
}

class RecordingStore implements ContinuousLearningStore {
  remembered: LearningCandidate[] = []
  probationary: LearningCandidate[] = []
  promoteOnStore = false
  async hasContent() { return false }
  async remember(item: LearningCandidate) { this.remembered.push(item) }
  async rememberProbationary(item: LearningCandidate) { this.probationary.push(item); return this.promoteOnStore }
}

// The LIVE daily policy: minimumConfidence 0.72 (ZERO_LLM_POLICY in dailyAutonomousLearning.ts).
const livePolicy = {
  allowedSourceKinds: new Set(['scientific_journal' as const]),
  minimumConfidence: 0.72,
  maxCandidatesPerCycle: 50,
  maxExternalCostUsdPerCycle: 0,
}

test('a probationary candidate in the 0.65-0.72 band reaches probationary storage under the live 0.72 policy', async () => {
  const store = new RecordingStore()
  const director = new ContinuousLearningDirector(store, livePolicy)
  const admission = classifyTieredAdmission({ rawRelevance: 0.75, confidence: 0.66, sourceFloor: 0.72, gapAligned: false })
  assert.equal(admission.tier, 'probationary')
  const decision = await director.admit(candidate({ confidence: 0.66, admission }))
  assert.deepEqual(decision, { accepted: false, deferred: true, reason: 'probationary' })
  assert.equal(store.probationary.length, 1, 'the candidate must land in probationary storage, not die at confidence_too_low')
})

test('a probationary candidate below even the probationary floor is still rejected', async () => {
  const store = new RecordingStore()
  const director = new ContinuousLearningDirector(store, livePolicy)
  const admission = classifyTieredAdmission({ rawRelevance: 0.75, confidence: 0.66, sourceFloor: 0.72, gapAligned: false })
  const decision = await director.admit(candidate({
    confidence: PROBATIONARY_MINIMUM_CONFIDENCE - 0.05,
    facts: [{ predicate: 'source_excerpt', object: 'x', confidence: PROBATIONARY_MINIMUM_CONFIDENCE - 0.05 }],
    admission,
  }))
  assert.deepEqual(decision, { accepted: false, reason: 'confidence_too_low' })
  assert.equal(store.probationary.length, 0)
})

test('a candidate clearing the standing floors is admitted exactly as before tiers existed', async () => {
  const store = new RecordingStore()
  const director = new ContinuousLearningDirector(store, livePolicy)
  const decision = await director.admit(candidate({
    confidence: 0.8,
    facts: [{ predicate: 'source_excerpt', object: 'A summary about sensor fusion.', confidence: 0.8 }],
  }))
  assert.deepEqual(decision, { accepted: true, reason: 'new_verified_knowledge' })
  assert.equal(store.remembered.length, 1)
  assert.equal(store.probationary.length, 0)
})

test('probationary storage that reports promotion surfaces as an accepted decision', async () => {
  const store = new RecordingStore()
  store.promoteOnStore = true
  const director = new ContinuousLearningDirector(store, livePolicy)
  const admission = classifyTieredAdmission({ rawRelevance: 0.75, confidence: 0.7, sourceFloor: 0.72, gapAligned: true })
  const decision = await director.admit(candidate({ confidence: 0.7, admission }))
  assert.deepEqual(decision, { accepted: true, reason: 'probationary_promoted' })
})

test('the metadata band — past its 0.6 kind floor but under the 0.72 policy floor — is deferred, not rejected', async () => {
  const store = new RecordingStore()
  const director = new ContinuousLearningDirector(store, livePolicy)
  const admission = classifyTieredAdmission({ rawRelevance: 0.4, confidence: 0.68, sourceFloor: 0.6, gapAligned: false })
  assert.equal(admission.tier, 'probationary')
  const decision = await director.admit(candidate({ confidence: 0.68, admission }))
  assert.deepEqual(decision, { accepted: false, deferred: true, reason: 'probationary' })
  assert.equal(store.probationary.length, 1)
})

test('tier metadata never gates a candidate that clears the policy floor', async () => {
  const store = new RecordingStore()
  const director = new ContinuousLearningDirector(store, livePolicy)
  const admission = classifyTieredAdmission({ rawRelevance: 0.05, confidence: 0.9, sourceFloor: 0.6, gapAligned: false })
  assert.equal(admission.tier, 'rejected')
  const decision = await director.admit(candidate({
    confidence: 0.9,
    facts: [{ predicate: 'source_excerpt', object: 'A summary about sensor fusion.', confidence: 0.9 }],
    admission,
  }))
  assert.deepEqual(decision, { accepted: true, reason: 'new_verified_knowledge' })
  assert.equal(store.remembered.length, 1)
  assert.equal(store.probationary.length, 0)
})

test('the probationary relevance bar is calibrated to the coverage metric, not the schema paper', () => {
  const admission = classifyTieredAdmission({ rawRelevance: 0.4, confidence: 0.66, sourceFloor: 0.6, gapAligned: false })
  assert.equal(admission.tier, 'probationary')
  assert.equal(admission.corroborationRequired, true)
})

test('no journal-kind candidate can reach the high tier, so direct admission must not depend on it', () => {
  const admission = classifyTieredAdmission({ rawRelevance: 0.99, confidence: 0.99, sourceFloor: 0.72, gapAligned: false })
  assert.notEqual(admission.tier, 'high_confidence')
})
