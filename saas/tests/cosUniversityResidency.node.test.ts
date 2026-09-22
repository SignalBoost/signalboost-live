import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BUILDER_RESIDENCY_COMPETENCIES,
  assessBuilderResidency,
  decideBuilderResidencyAdmission,
  finalEvaluationResidencyGate,
  type BuilderResidencyEvidence,
} from '../lib/ai/cos/cosUniversityResidency.ts'

const HASH = 'a'.repeat(64)
const REVISION = 'b'.repeat(64)

test('Builder Residency admits a trained student before final evaluation and never expands authority', () => {
  const ok = decideBuilderResidencyAdmission({
    artifactRowId: 'artifact-row-1',
    candidateId: 'mass:builder:1',
    subjectId: 'Computer Science & Coding',
    trainedArtifactId: 'cadomos/itmounts-student-builder',
    trainedArtifactHash: HASH,
    revisionKey: REVISION,
    artifactStatus: 'evaluation_pending',
    authorityExpanded: false,
  })
  assert.equal(ok.eligible, true)
  assert.equal(ok.formalEducationStage, 'practical_residency')
  assert.equal(ok.productionAuthorityExpanded, false)

  const blocked = decideBuilderResidencyAdmission({
    artifactRowId: 'artifact-row-1',
    candidateId: 'mass:builder:1',
    subjectId: 'Computer Science & Coding',
    trainedArtifactId: 'cadomos/itmounts-student-builder',
    trainedArtifactHash: HASH,
    revisionKey: REVISION,
    artifactStatus: 'runtime_pending',
    authorityExpanded: false,
  })
  assert.equal(blocked.eligible, false)
  assert.ok(blocked.blockers.includes('residency_trained_artifact_not_ready'))
})

test('Builder final evaluation is blocked until formal Residency completes', () => {
  assert.deepEqual(finalEvaluationResidencyGate({
    subjectId: 'Computer Science & Coding',
    standing: 'senior_resident',
  }), {
    required: true,
    allowed: false,
    reason: 'formal_residency_not_complete',
  })
  assert.equal(finalEvaluationResidencyGate({
    subjectId: 'Computer Science & Coding',
    standing: 'residency_complete',
  }).allowed, true)
  assert.equal(finalEvaluationResidencyGate({
    subjectId: 'Mathematics',
    standing: null,
  }).allowed, true)
})

function evidence(
  competencyId: typeof BUILDER_RESIDENCY_COMPETENCIES[number],
  caseNo: number,
  observedAt: string,
  outcome: 'pass' | 'fail' = 'pass',
): BuilderResidencyEvidence {
  return {
    competencyId,
    candidateId: 'mass:builder:1',
    artifactHash: HASH,
    caseId: 'case-' + competencyId + '-' + caseNo,
    caseFingerprint: caseNo.toString(16).padStart(64, '0'),
    evidenceRef: 'db://residency/' + competencyId + '/' + caseNo,
    verifier: 'host_production_verifier',
    outcome,
    exactArtifact: true,
    independentlyVerified: true,
    authorityExpanded: false,
    observedAt,
  }
}

test('competency advances from supervised to demonstrated to retained using distinct cases', () => {
  const competency = 'root_cause_debugging'
  let assessment = assessBuilderResidency({
    candidateId: 'mass:builder:1',
    artifactHash: HASH,
    evidence: [evidence(competency, 1, '2026-09-20T10:00:00Z')],
  })
  assert.equal(assessment.competencies.find(x => x.competencyId === competency)?.state, 'supervised')

  assessment = assessBuilderResidency({
    candidateId: 'mass:builder:1',
    artifactHash: HASH,
    evidence: [
      evidence(competency, 1, '2026-09-20T10:00:00Z'),
      evidence(competency, 2, '2026-09-20T11:00:00Z'),
    ],
  })
  assert.equal(assessment.competencies.find(x => x.competencyId === competency)?.state, 'demonstrated')

  assessment = assessBuilderResidency({
    candidateId: 'mass:builder:1',
    artifactHash: HASH,
    evidence: [
      evidence(competency, 1, '2026-09-20T10:00:00Z'),
      evidence(competency, 2, '2026-09-20T11:00:00Z'),
      evidence(competency, 3, '2026-09-21T12:00:00Z'),
    ],
  })
  assert.equal(assessment.competencies.find(x => x.competencyId === competency)?.state, 'retained')
})

test('duplicate cases do not manufacture competence', () => {
  const competency = 'implementation_repair'
  const first = evidence(competency, 1, '2026-09-20T10:00:00Z')
  const duplicate = { ...first, caseId: 'renamed-case', observedAt: '2026-09-20T11:00:00Z' }
  const assessment = assessBuilderResidency({
    candidateId: 'mass:builder:1',
    artifactHash: HASH,
    evidence: [first, duplicate],
  })
  assert.equal(assessment.competencies.find(x => x.competencyId === competency)?.state, 'supervised')
})

test('a verified Residency failure requires remediation until two distinct newer passes exist', () => {
  const competency = 'failure_recovery'
  let assessment = assessBuilderResidency({
    candidateId: 'mass:builder:1',
    artifactHash: HASH,
    evidence: [
      evidence(competency, 1, '2026-09-20T10:00:00Z'),
      evidence(competency, 2, '2026-09-20T11:00:00Z', 'fail'),
      evidence(competency, 3, '2026-09-20T12:00:00Z'),
    ],
  })
  assert.equal(assessment.standing, 'remediation_required')
  assert.equal(assessment.competencies.find(x => x.competencyId === competency)?.state, 'remediation_required')

  assessment = assessBuilderResidency({
    candidateId: 'mass:builder:1',
    artifactHash: HASH,
    evidence: [
      evidence(competency, 1, '2026-09-20T10:00:00Z'),
      evidence(competency, 2, '2026-09-20T11:00:00Z', 'fail'),
      evidence(competency, 3, '2026-09-20T12:00:00Z'),
      evidence(competency, 4, '2026-09-20T13:00:00Z'),
    ],
  })
  assert.equal(assessment.competencies.find(x => x.competencyId === competency)?.state, 'demonstrated')
})

test('Residency completes only when every Builder competency is demonstrated', () => {
  const rows = BUILDER_RESIDENCY_COMPETENCIES.flatMap((competencyId, i) => [
    evidence(competencyId, i * 2 + 1, '2026-09-20T10:00:00Z'),
    evidence(competencyId, i * 2 + 2, '2026-09-20T11:00:00Z'),
  ])
  const assessment = assessBuilderResidency({
    candidateId: 'mass:builder:1',
    artifactHash: HASH,
    evidence: rows,
  })
  assert.equal(assessment.standing, 'residency_complete')
  assert.equal(assessment.residencyCompletionEligible, true)
  assert.equal(assessment.productionAuthorityExpanded, false)
})
