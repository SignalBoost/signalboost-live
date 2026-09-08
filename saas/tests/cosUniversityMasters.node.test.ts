import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COS_UNIVERSITY_MASTERS_PROGRAMS,
  COS_UNIVERSITY_MASTERS_TRACKS,
  cosUniversityMastersCredentialKey,
  cosUniversityMastersExpectedAuthority,
  cosUniversityMastersProgramKey,
  cosUniversityMastersTrackById,
  evaluateCosUniversityMastersAdmission,
  evaluateCosUniversityMastersGraduation,
  rankCosUniversityMastersTracks,
  type CosUniversityMastersEvidence,
  type CosUniversityMastersProgramId,
} from '../lib/ai/cos/cosUniversityMasters.ts'
import type { CosUniversitySubjectId } from '../lib/ai/cos/cosUniversity.ts'

const NOW = new Date('2026-10-01T00:00:00Z')

test('five Master’s tracks exist, each with a distinct id and a stable program key', () => {
  assert.equal(COS_UNIVERSITY_MASTERS_TRACKS.length, 5)
  assert.equal(Object.keys(COS_UNIVERSITY_MASTERS_PROGRAMS).length, 5)
  const ids = COS_UNIVERSITY_MASTERS_TRACKS.map((track) => track.id)
  assert.equal(new Set(ids).size, 5)
  for (const track of COS_UNIVERSITY_MASTERS_TRACKS) {
    assert.equal(cosUniversityMastersProgramKey(track.id), `specialist_masters_${track.id}_v1`)
    assert.ok(track.coreSubjects.length > 0)
    assert.ok(track.requiredDepthPasses >= 1)
    assert.deepEqual(COS_UNIVERSITY_MASTERS_PROGRAMS[track.id].primarySubjects, track.coreSubjects)
  }
})

test('cosUniversityMastersTrackById finds a real track and returns null for an unknown id', () => {
  assert.equal(cosUniversityMastersTrackById('applied_ai_systems')?.title, 'Applied AI Systems')
  assert.equal(cosUniversityMastersTrackById('not_a_real_track'), null)
})

test('ranking picks the track whose core subjects match the strongest undergraduate standing', () => {
  const standing = new Map<CosUniversitySubjectId, number>([
    ['cybersecurity', 6],
    ['computer_science', 5],
    ['statistics_data_science', 2],
    ['mathematics', 2],
  ])
  const ranked = rankCosUniversityMastersTracks(standing)
  assert.equal(ranked[0].track.id, 'security_and_trust')
  assert.ok(ranked[0].score > ranked[1].score)
})

test('ranking with no standing at all yields zero scores for every track, in stable catalog order', () => {
  const ranked = rankCosUniversityMastersTracks(new Map())
  assert.ok(ranked.every((entry) => entry.score === 0))
  assert.deepEqual(ranked.map((entry) => entry.track.id), COS_UNIVERSITY_MASTERS_TRACKS.map((t) => t.id))
})

test('Master’s credential keys are stable and agent-scoped', () => {
  assert.equal(cosUniversityMastersCredentialKey('cos', 'applied_ai_systems'), 'cos:masters:applied_ai_systems:v1')
  assert.notEqual(cosUniversityMastersCredentialKey('agent-b', 'applied_ai_systems'), cosUniversityMastersCredentialKey('cos', 'applied_ai_systems'))
})

test('Master’s admission requires an awarded undergraduate credential plus current A-range core competence', () => {
  const denied = evaluateCosUniversityMastersAdmission('applied_ai_systems', {
    undergraduateCredentialAwarded: false,
    currentGeneralistStanding: 'A+',
    currentSubjectStanding: { computer_science: 'A+', statistics_data_science: 'A' },
  })
  assert.equal(denied.admitted, false)
  assert.ok(denied.reasons.includes('undergraduate_credential_required'))

  const admitted = evaluateCosUniversityMastersAdmission('applied_ai_systems', {
    undergraduateCredentialAwarded: true,
    currentGeneralistStanding: 'A',
    currentSubjectStanding: { computer_science: 'A+', statistics_data_science: 'A' },
  })
  assert.deepEqual(admitted, { admitted: true, reasons: [] })
})

test('a strong generalist cannot enter a specialist Master’s with a weak core prerequisite', () => {
  const decision = evaluateCosUniversityMastersAdmission('security_and_trust', {
    undergraduateCredentialAwarded: true,
    currentGeneralistStanding: 'A+',
    currentSubjectStanding: { cybersecurity: 'A+', computer_science: 'A-' },
  })
  assert.equal(decision.admitted, false)
  assert.ok(decision.reasons.includes('subject_A_required:computer_science'))
})

function pass(
  stage: CosUniversityMastersEvidence['stage'],
  variantHash: string,
  extra: Partial<CosUniversityMastersEvidence> = {},
): CosUniversityMastersEvidence {
  return {
    programId: 'applied_ai_systems',
    stage,
    passed: true,
    variantHash,
    observedAt: '2026-09-08T00:00:00Z',
    validUntil: '2027-09-08T00:00:00Z',
    independent: stage !== 'graduate_coursework',
    authority: cosUniversityMastersExpectedAuthority(stage),
    verifiedPractical: stage === 'verified_practical_work' ? true : undefined,
    ...extra,
  }
}

function completeEvidence(programId: CosUniversityMastersProgramId = 'applied_ai_systems'): CosUniversityMastersEvidence[] {
  return [
    pass('graduate_coursework', 'coursework', { programId }),
    pass('independent_specialist_exam', 'exam-a', { programId }),
    pass('independent_specialist_exam', 'exam-b', { programId }),
    pass('independent_specialist_exam', 'exam-c', { programId }),
    pass('cross_domain_transfer', 'transfer-a', { programId }),
    pass('cross_domain_transfer', 'transfer-b', { programId }),
    pass('verified_practical_work', 'production-a', { programId }),
    pass('masters_capstone', 'capstone-a', { programId }),
    pass('masters_capstone', 'capstone-b', { programId }),
  ]
}

test('Master’s graduation requires depth exams, transfer, practical proof, and capstone', () => {
  const decision = evaluateCosUniversityMastersGraduation('applied_ai_systems', completeEvidence(), NOW)
  assert.equal(decision.graduated, true)
  assert.equal(decision.standing, 'A')
  assert.deepEqual(decision.blockers, [])
  assert.equal(decision.authorityExpanded, false)
})

test('evidence from one Master’s track cannot graduate another specialization', () => {
  const aiEvidence = completeEvidence('applied_ai_systems')
  const security = evaluateCosUniversityMastersGraduation('security_and_trust', aiEvidence, NOW)
  assert.equal(security.graduated, false)
  assert.equal(security.standing, 'not_graduated')
  assert.ok(security.blockers.includes('independent_specialist_exam_incomplete'))
  assert.ok(security.blockers.includes('masters_capstone_incomplete'))
})

test('a later failed specialist exam revokes the repeated-pass stage until re-earned', () => {
  const evidence: CosUniversityMastersEvidence[] = [
    pass('graduate_coursework', 'coursework'),
    pass('independent_specialist_exam', 'exam-a', { observedAt: '2026-09-01T00:00:00Z' }),
    pass('independent_specialist_exam', 'exam-b', { observedAt: '2026-09-02T00:00:00Z' }),
    pass('independent_specialist_exam', 'exam-c', { observedAt: '2026-09-03T00:00:00Z' }),
    { ...pass('independent_specialist_exam', 'exam-fail', { observedAt: '2026-09-04T00:00:00Z' }), passed: false },
    pass('cross_domain_transfer', 'transfer-a'),
    pass('cross_domain_transfer', 'transfer-b'),
    pass('verified_practical_work', 'production-a'),
    pass('masters_capstone', 'capstone-a'),
    pass('masters_capstone', 'capstone-b'),
  ]
  const decision = evaluateCosUniversityMastersGraduation('applied_ai_systems', evidence, NOW)
  assert.equal(decision.graduated, false)
  assert.ok(decision.blockers.includes('independent_specialist_exam_incomplete'))
})

test('stale, self-scored, wrong-authority, malformed-time, or blank-variant evidence cannot earn a degree', () => {
  const evidence: CosUniversityMastersEvidence[] = [
    pass('graduate_coursework', 'coursework'),
    pass('independent_specialist_exam', 'exam-a'),
    pass('independent_specialist_exam', 'exam-b'),
    pass('independent_specialist_exam', '   '),
    pass('cross_domain_transfer', 'transfer-a'),
    pass('cross_domain_transfer', 'transfer-b', { authority: 'verified_production' }),
    pass('verified_practical_work', 'production-a', { validUntil: '2026-09-20T00:00:00Z' }),
    pass('masters_capstone', 'capstone-a'),
    pass('masters_capstone', 'capstone-b', { observedAt: 'not-a-date' }),
  ]
  const decision = evaluateCosUniversityMastersGraduation('applied_ai_systems', evidence, NOW)
  assert.equal(decision.graduated, false)
  assert.ok(decision.blockers.includes('independent_specialist_exam_incomplete'))
  assert.ok(decision.blockers.includes('cross_domain_transfer_incomplete'))
  assert.ok(decision.blockers.includes('verified_practical_work_incomplete'))
  assert.ok(decision.blockers.includes('masters_capstone_incomplete'))
})

test('A+ Master’s standing requires exceptional repeated evidence beyond the A minimum', () => {
  const evidence: CosUniversityMastersEvidence[] = [
    ...completeEvidence(),
    pass('independent_specialist_exam', 'exam-d'),
    pass('cross_domain_transfer', 'transfer-c'),
    pass('verified_practical_work', 'production-b'),
    pass('masters_capstone', 'capstone-c'),
  ]
  const decision = evaluateCosUniversityMastersGraduation('applied_ai_systems', evidence, NOW)
  assert.equal(decision.graduated, true)
  assert.equal(decision.standing, 'A+')
})
