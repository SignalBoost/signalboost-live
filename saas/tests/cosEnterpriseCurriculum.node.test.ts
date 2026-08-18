import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COS_CORE_CURRICULUM_TRACKS,
  coreCurriculumTrackForSubject,
  curriculumTrackEvidence,
  curriculumSignalsFromIndependence,
} from '../lib/ai/cos/cosCurriculumPriority.ts'

test('commercial execution track is draft-only and approval-governed', () => {
  const track = COS_CORE_CURRICULUM_TRACKS.find(item => item.id === 'enterprise_commercial')
  assert.ok(track)
  assert.match(track.safetyBoundary, /No sending, publishing, spending, or CRM mutation without a recorded human approval/i)
  assert.match(track.safetyBoundary, /never invent a statistic/i)
  assert.match(track.safetyBoundary, /suppression and unsubscribe/i)
  assert.ok(track.evaluation.length >= 3)
  assert.equal(coreCurriculumTrackForSubject('outreach campaign conversion measurement')?.id, 'enterprise_commercial')
  assert.equal(coreCurriculumTrackForSubject('pricing and licence packaging')?.id, 'enterprise_commercial')
})

test('governance track refuses to assert compliance status it does not hold', () => {
  const track = COS_CORE_CURRICULUM_TRACKS.find(item => item.id === 'enterprise_governance')
  assert.ok(track)
  assert.match(track.safetyBoundary, /Not legal advice and not a certification/i)
  assert.match(track.safetyBoundary, /cite a real artifact or be marked unimplemented/i)
  assert.match(track.safetyBoundary, /never assert a certification, audit result, penetration test, or compliance status/i)
  assert.equal(coreCurriculumTrackForSubject('security questionnaire and audit evidence')?.id, 'enterprise_governance')
  assert.equal(coreCurriculumTrackForSubject('GDPR data protection obligations')?.id, 'enterprise_governance')
})

// Procurement wording must beat the cyber rule: a "security questionnaire" is a procurement
// artifact, and a real incident must still reach cyber defense.
test('procurement wording outranks cyber wording, and incidents still reach cyber defense', () => {
  assert.equal(coreCurriculumTrackForSubject('vendor security questionnaire')?.id, 'enterprise_governance')
  assert.equal(coreCurriculumTrackForSubject('security incident triage')?.id, 'cyber_defense')
})

test('curriculum evidence carries the track, its evaluation and its safety boundary', () => {
  const evidence = curriculumTrackEvidence('approval-ready outreach campaign drafting')
  assert.equal(evidence.length, 3)
  assert.ok(evidence[0] === 'curriculum_track=enterprise_commercial')
  assert.ok(evidence[1].startsWith('curriculum_evaluation='))
  assert.ok(evidence[2].startsWith('curriculum_safety_boundary='))
  assert.deepEqual(curriculumTrackEvidence('kitchen gardening'), [])
})

test('generated curriculum signals include the track evidence', () => {
  const signals = curriculumSignalsFromIndependence({
    targetIndependentPassRate: 0.85,
    subjects: {
      'outreach campaign drafting': {
        attempts: 12,
        independentAccepted: 3,
        externalRequired: 4,
        teacherInteractions: 2,
        negativeFeedback: 1,
        userCorrections: 2,
        productionOutcomes: 5,
        productionFailures: 2,
      },
    },
  } as never)

  assert.equal(signals.length, 1)
  const evidence = signals[0].evidence ?? []
  assert.ok(evidence.includes('curriculum_track=enterprise_commercial'))
  assert.ok(evidence.some(line => line.startsWith('curriculum_safety_boundary=')))
  assert.ok(evidence.includes('curriculum_source=measured_independence_metrics'))
})
