import './cosUniversityMastersLearning.node.test.ts'
import './cosUniversityMastersExam.node.test.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COS_UNIVERSITY_MASTERS_PROGRAMS,
  COS_UNIVERSITY_MASTERS_TRACKS,
  cosUniversityMastersCredentialKey,
  cosUniversityMastersExpectedAuthority,
  cosUniversityMastersModuleByKey,
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

test('ten Master’s tracks expose four canonical curriculum modules each', () => {
  assert.equal(COS_UNIVERSITY_MASTERS_TRACKS.length, 10)
  assert.equal(Object.keys(COS_UNIVERSITY_MASTERS_PROGRAMS).length, 10)
  const moduleKeys = new Set<string>()
  for (const track of COS_UNIVERSITY_MASTERS_TRACKS) {
    assert.equal(track.curriculumModules.length, 4)
    assert.equal(COS_UNIVERSITY_MASTERS_PROGRAMS[track.id].courseworkModuleKeys.length, 4)
    assert.equal(cosUniversityMastersProgramKey(track.id), `specialist_masters_${track.id}_v1`)
    for (const module of track.curriculumModules) {
      assert.ok(module.objective.length > 40)
      assert.equal(cosUniversityMastersModuleByKey(track.id, module.key)?.title, module.title)
      assert.equal(moduleKeys.has(module.key), false)
      moduleKeys.add(module.key)
    }
  }
  assert.equal(moduleKeys.size, 40)
})

test('advanced professional curricula preserve the common foundation and require practical proof', () => {
  const required = [
    'aerospace_nuclear_safety_systems', 'molecular_biomedical_sciences',
    'neuroscience_biophysical_systems', 'actuarial_insurance_risk',
    'quantum_theoretical_physics',
  ] as const
  for (const id of required) {
    const track = cosUniversityMastersTrackById(id)
    assert.ok(track)
    assert.equal(track.curriculumModules.length, 4)
    assert.ok(track.requiredDepthPasses >= 4)
    assert.ok(COS_UNIVERSITY_MASTERS_PROGRAMS[id].requiredEvidenceStages.includes('verified_practical_work'))
    assert.ok(COS_UNIVERSITY_MASTERS_PROGRAMS[id].requiredEvidenceStages.includes('cross_domain_transfer'))
  }
})

test('canonical ranking still chooses the strongest undergraduate specialization', () => {
  const standing = new Map<CosUniversitySubjectId, number>([
    ['cybersecurity', 6], ['computer_science', 5], ['statistics_data_science', 2], ['mathematics', 2],
  ])
  assert.equal(rankCosUniversityMastersTracks(standing)[0].track.id, 'security_and_trust')
  assert.equal(cosUniversityMastersTrackById('not_a_real_track'), null)
})

test('Master’s credential keys are agent-scoped and admission remains evidence-gated', () => {
  assert.equal(cosUniversityMastersCredentialKey('cos', 'applied_ai_systems'), 'cos:masters:applied_ai_systems:v1')
  const denied = evaluateCosUniversityMastersAdmission('applied_ai_systems', {
    undergraduateCredentialAwarded: false,
    currentGeneralistStanding: 'A+',
    currentSubjectStanding: { computer_science: 'A+', statistics_data_science: 'A' },
  })
  assert.ok(denied.reasons.includes('undergraduate_credential_required'))
  const admitted = evaluateCosUniversityMastersAdmission('applied_ai_systems', {
    undergraduateCredentialAwarded: true,
    currentGeneralistStanding: 'A',
    currentSubjectStanding: { computer_science: 'A+', statistics_data_science: 'A' },
  })
  assert.deepEqual(admitted, { admitted: true, reasons: [] })
})

function pass(
  stage: CosUniversityMastersEvidence['stage'],
  variantHash: string,
  extra: Partial<CosUniversityMastersEvidence> = {},
): CosUniversityMastersEvidence {
  return {
    programId: 'applied_ai_systems',
    moduleKey: null,
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

function coursework(programId: CosUniversityMastersProgramId): CosUniversityMastersEvidence[] {
  return COS_UNIVERSITY_MASTERS_PROGRAMS[programId].courseworkModuleKeys.map((moduleKey, index) =>
    pass('graduate_coursework', `coursework-${index}`, { programId, moduleKey }),
  )
}

function completeEvidence(programId: CosUniversityMastersProgramId = 'applied_ai_systems'): CosUniversityMastersEvidence[] {
  return [
    ...coursework(programId),
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

test('one generic coursework pass cannot substitute for the full Master’s curriculum', () => {
  const evidence = completeEvidence().filter(row => row.stage !== 'graduate_coursework')
  evidence.unshift(pass('graduate_coursework', 'generic', { moduleKey: null }))
  const decision = evaluateCosUniversityMastersGraduation('applied_ai_systems', evidence, NOW)
  assert.equal(decision.graduated, false)
  assert.ok(decision.blockers.includes('graduate_coursework_incomplete'))
  assert.ok(decision.blockers.some(reason => reason.startsWith('coursework_module_incomplete:')))
})

test('all modules plus depth, transfer, practical proof and capstone earn A standing', () => {
  const decision = evaluateCosUniversityMastersGraduation('applied_ai_systems', completeEvidence(), NOW)
  assert.deepEqual(decision, { graduated: true, standing: 'A', blockers: [], authorityExpanded: false })
})

test('evidence from one Master’s track cannot graduate another specialization', () => {
  const decision = evaluateCosUniversityMastersGraduation('security_and_trust', completeEvidence('applied_ai_systems'), NOW)
  assert.equal(decision.graduated, false)
  assert.ok(decision.blockers.includes('graduate_coursework_incomplete'))
  assert.ok(decision.blockers.includes('independent_specialist_exam_incomplete'))
})

test('a later failed specialist exam resets depth until new distinct passes are earned', () => {
  const evidence = completeEvidence()
  evidence.push({ ...pass('independent_specialist_exam', 'exam-fail', { observedAt: '2026-09-09T00:00:00Z' }), passed: false })
  const decision = evaluateCosUniversityMastersGraduation('applied_ai_systems', evidence, NOW)
  assert.equal(decision.graduated, false)
  assert.ok(decision.blockers.includes('independent_specialist_exam_incomplete'))
})

test('stale, malformed, future, wrong-authority, or wrong-module evidence cannot earn a degree', () => {
  const evidence = completeEvidence()
  evidence[0] = { ...evidence[0], moduleKey: 'not-a-module' }
  evidence[1] = { ...evidence[1], observedAt: '2027-01-01T00:00:00Z', validUntil: '2028-01-01T00:00:00Z' }
  evidence.push(pass('cross_domain_transfer', 'bad-authority', { authority: 'verified_production' }))
  const decision = evaluateCosUniversityMastersGraduation('applied_ai_systems', evidence, NOW)
  assert.equal(decision.graduated, false)
  assert.ok(decision.blockers.includes('graduate_coursework_incomplete'))
})

test('A+ Master’s standing requires evidence beyond the A minimum', () => {
  const evidence: CosUniversityMastersEvidence[] = [
    ...completeEvidence(),
    pass('independent_specialist_exam', 'exam-d'),
    pass('cross_domain_transfer', 'transfer-c'),
    pass('verified_practical_work', 'production-b'),
    pass('masters_capstone', 'capstone-c'),
  ]
  assert.equal(evaluateCosUniversityMastersGraduation('applied_ai_systems', evidence, NOW).standing, 'A+')
})
