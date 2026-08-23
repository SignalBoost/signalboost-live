import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { buildCalibrationCohorts } from '../lib/ai/cos/answerConfidenceCalibration.ts'
test('cohort calibration stays shadow-only',()=>{const rows=Array.from({length:30},(_,i)=>({predicted:i%2?.8:.2,observed:i%2===1,problemClass:'database',reasonerLabel:'local',evidenceRegime:'learned_corpus'}));const cohort=buildCalibrationCohorts(rows)[0];assert.equal(cohort.shadowRecommendation.eligible,false);assert.match(cohort.shadowRecommendation.reason,/Shadow-only|No threshold/i)})
test('owner route is read-only and does not change live policy',()=>{const route=readFileSync(new URL('../app/api/admin/cos-calibration-learning/route.ts',import.meta.url),'utf8'),store=readFileSync(new URL('../lib/ai/cos/calibrationLearningStore.ts',import.meta.url),'utf8');assert.match(route,/requireOwner\(\)/);assert.doesNotMatch(route,/export async function POST/);assert.match(store,/livePolicyChanged:false/)})


test('calibration uses authoritative outcomes and actual evidence utilization', async () => {
  const { authoritativeVerifiedSuccess, calibrationEvidenceRegime } = await import('../lib/ai/cos/calibrationLearningStore.ts')
  assert.equal(authoritativeVerifiedSuccess({ verified_success: false, cos_turn_outcomes: { verified_success: true } }), true)
  assert.equal(authoritativeVerifiedSuccess({ cos_turn_outcomes: [{ verified_success: false }] }), false)
  assert.equal(calibrationEvidenceRegime({ evidenceSummary: { learnedCorpus: { injected: 0, cited: 0 } }), 'ungrounded_or_unknown')
  assert.equal(calibrationEvidenceRegime({ evidenceSummary: { learnedCorpus: { injected: 3, cited: 0 } }), 'learned_corpus')
  assert.equal(calibrationEvidenceRegime({ evidenceSummary: { learnedCorpus: { injected: 0, cited: 0 } }, routeClass: 'fresh' }), 'live_evidence')
  assert.equal(calibrationEvidenceRegime({ evidenceSummary: { learnedCorpus: { injected: 2, cited: 1 } }, responseSource: 'authoritative_live' }), 'mixed_evidence')
})
