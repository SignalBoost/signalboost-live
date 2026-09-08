import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COS_UNIVERSITY_MASTERS_PROGRAMS,
  cosUniversityMastersCredentialKey,
  cosUniversityMastersExpectedAuthority,
  cosUniversityMastersProgramKey,
  evaluateCosUniversityMastersAdmission,
  evaluateCosUniversityMastersGraduation,
  type CosUniversityMastersEvidence,
} from '../lib/ai/cos/cosUniversityMasters.ts'

const NOW = new Date('2026-10-01T00:00:00Z')

test('Master’s catalog is graduate depth over the A/A+ generalist foundation', () => {
  assert.equal(Object.keys(COS_UNIVERSITY_MASTERS_PROGRAMS).length, 11)
  for (const program of Object.values(COS_UNIVERSITY_MASTERS_PROGRAMS)) {
    assert.equal(program.admissionMinimumStanding, 'A')
    assert.ok(program.primarySubjects.length >= 2)
    assert.deepEqual(program.requiredEvidenceStages, [
      'graduate_coursework',
      'independent_specialist_exam',
      'cross_domain_transfer',
      'verified_practical_work',
      'masters_capstone',
    ])
  }
})

test('Master’s program and credential keys are stable and agent-scoped', () => {
  assert.equal(cosUniversityMastersProgramKey('software_engineering'), 'masters:software_engineering:v1')
  assert.equal(cosUniversityMastersCredentialKey('cos', 'software_engineering'), 'cos:masters:software_engineering:v1')
  assert.notEqual(cosUniversityMastersCredentialKey('agent-b', 'software_engineering'), cosUniversityMastersCredentialKey('cos', 'software_engineering'))
})

test('Master’s admission requires an awarded undergraduate credential plus current A-range competence', () => {
  const denied = evaluateCosUniversityMastersAdmission('software_engineering', {
    undergraduateCredentialAwarded: false,
    currentGeneralistStanding: 'A+',
    currentSubjectStanding: {
      computer_science: 'A+', reasoning_decision_science: 'A', business_operations: 'A',
    },
  })
  assert.equal(denied.admitted, false)
  assert.ok(denied.reasons.includes('undergraduate_credential_required'))

  const admitted = evaluateCosUniversityMastersAdmission('software_engineering', {
    undergraduateCredentialAwarded: true,
    currentGeneralistStanding: 'A',
    currentSubjectStanding: {
      computer_science: 'A+', reasoning_decision_science: 'A', business_operations: 'A',
    },
  })
  assert.deepEqual(admitted, { admitted: true, reasons: [] })
})

test('a strong generalist cannot enter a specialist Master’s with a weak primary prerequisite', () => {
  const decision = evaluateCosUniversityMastersAdmission('cybersecurity', {
    undergraduateCredentialAwarded: true,
    currentGeneralistStanding: 'A+',
    currentSubjectStanding: {
      cybersecurity: 'A+', computer_science: 'A-', law_regulation_governance: 'A',
    },
  })
  assert.equal(decision.admitted, false)
  assert.ok(decision.reasons.includes('subject_A_required:computer_science'))
})

function pass(stage: CosUniversityMastersEvidence['stage'], variantHash: string, extra: Partial<CosUniversityMastersEvidence> = {}): CosUniversityMastersEvidence {
  return {
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

test('Master’s graduation requires repeated independent exams, transfer, practical proof, and capstone', () => {
  const evidence: CosUniversityMastersEvidence[] = [
    pass('graduate_coursework', 'coursework'),
    pass('independent_specialist_exam', 'exam-a'),
    pass('independent_specialist_exam', 'exam-b'),
    pass('cross_domain_transfer', 'transfer-a'),
    pass('cross_domain_transfer', 'transfer-b'),
    pass('verified_practical_work', 'production-a'),
    pass('masters_capstone', 'capstone-a'),
    pass('masters_capstone', 'capstone-b'),
  ]
  const decision = evaluateCosUniversityMastersGraduation('software_engineering', evidence, NOW)
  assert.equal(decision.graduated, true)
  assert.equal(decision.standing, 'A')
  assert.deepEqual(decision.blockers, [])
  assert.equal(decision.authorityExpanded, false)
})

test('a later failed specialist exam revokes the repeated-pass stage until re-earned', () => {
  const evidence: CosUniversityMastersEvidence[] = [
    pass('graduate_coursework', 'coursework'),
    pass('independent_specialist_exam', 'exam-a', { observedAt: '2026-09-01T00:00:00Z' }),
    pass('independent_specialist_exam', 'exam-b', { observedAt: '2026-09-02T00:00:00Z' }),
    { ...pass('independent_specialist_exam', 'exam-fail', { observedAt: '2026-09-03T00:00:00Z' }), passed: false },
    pass('cross_domain_transfer', 'transfer-a'),
    pass('cross_domain_transfer', 'transfer-b'),
    pass('verified_practical_work', 'production-a'),
    pass('masters_capstone', 'capstone-a'),
    pass('masters_capstone', 'capstone-b'),
  ]
  const decision = evaluateCosUniversityMastersGraduation('software_engineering', evidence, NOW)
  assert.equal(decision.graduated, false)
  assert.equal(decision.standing, 'not_graduated')
  assert.ok(decision.blockers.includes('independent_specialist_exam_incomplete'))
})

test('stale, self-scored, or wrong-authority graduate evidence cannot earn a degree', () => {
  const evidence: CosUniversityMastersEvidence[] = [
    pass('graduate_coursework', 'coursework'),
    pass('independent_specialist_exam', 'exam-a'),
    pass('independent_specialist_exam', 'exam-b', { independent: false }),
    pass('cross_domain_transfer', 'transfer-a'),
    pass('cross_domain_transfer', 'transfer-b', { authority: 'verified_production' }),
    pass('verified_practical_work', 'production-a', { validUntil: '2026-09-20T00:00:00Z' }),
    pass('masters_capstone', 'capstone-a'),
    pass('masters_capstone', 'capstone-b'),
  ]
  const decision = evaluateCosUniversityMastersGraduation('software_engineering', evidence, NOW)
  assert.equal(decision.graduated, false)
  assert.ok(decision.blockers.includes('independent_specialist_exam_incomplete'))
  assert.ok(decision.blockers.includes('cross_domain_transfer_incomplete'))
  assert.ok(decision.blockers.includes('verified_practical_work_incomplete'))
})

test('A+ Master’s standing requires exceptional repeated evidence beyond the A minimum', () => {
  const evidence: CosUniversityMastersEvidence[] = [
    pass('graduate_coursework', 'coursework'),
    pass('independent_specialist_exam', 'exam-a'),
    pass('independent_specialist_exam', 'exam-b'),
    pass('independent_specialist_exam', 'exam-c'),
    pass('cross_domain_transfer', 'transfer-a'),
    pass('cross_domain_transfer', 'transfer-b'),
    pass('cross_domain_transfer', 'transfer-c'),
    pass('verified_practical_work', 'production-a'),
    pass('verified_practical_work', 'production-b'),
    pass('masters_capstone', 'capstone-a'),
    pass('masters_capstone', 'capstone-b'),
    pass('masters_capstone', 'capstone-c'),
  ]
  const decision = evaluateCosUniversityMastersGraduation('software_engineering', evidence, NOW)
  assert.equal(decision.graduated, true)
  assert.equal(decision.standing, 'A+')
})
