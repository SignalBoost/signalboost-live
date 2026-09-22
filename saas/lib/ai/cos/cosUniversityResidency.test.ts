import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BUILDER_RESIDENCY_V1_COMPETENCIES,
  assessBuilderResidency,
  decideResidencyAdmission,
  decideResidencyEvidence,
  finalEvaluationResidencyGate,
} from './cosUniversityResidency.ts'

const h = 'a'.repeat(64)
const v = 'b'.repeat(64)
const t = 'c'.repeat(64)
const r = 'd'.repeat(64)

const base = {
  candidateId: 'mass:test:0123456789abcdef',
  trainedArtifactHash: h,
  subjectId: 'computer_science_coding',
  caseFamily: 'broken_deployment',
  variantHash: v,
  competencyId: 'root_cause_diagnosis',
  outcome: 'pass' as const,
  observedAt: '2026-09-22T12:00:00Z',
  sandboxed: true,
  supervised: true,
  exactArtifactBound: true,
  finalExamMaterialUsed: false,
  authorityExpanded: false,
  productionMutationObserved: false,
  toolTrajectoryEvidenceHash: t,
}

describe('COS University Residency', () => {
  it('admits a trained student before final canary/evaluation', () => {
    const decision = decideResidencyAdmission({
      artifactRowId: 'artifact-row-1',
      candidateId: base.candidateId,
      subjectId: 'Computer Science & Coding',
      trainedArtifactId: 'cadomos/itmounts-student-test',
      trainedArtifactHash: h,
      revisionKey: r,
      artifactStatus: 'evaluation_pending',
      authorityExpanded: false,
    })
    assert.equal(decision.eligible, true)
    assert.equal(decision.formalEducationStage, 'practical_residency')
    assert.equal(decision.promotionAuthorized, false)
  })

  it('records supervised practical evidence without requiring a final-exam pass', () => {
    const decision = decideResidencyEvidence(base)
    assert.equal(decision.accepted, true)
    assert.match(decision.evidenceHash ?? '', /^[a-f0-9]{64}$/)
    assert.equal(decision.promotionAuthorized, false)
    assert.equal(decision.productionTrafficAuthorized, false)
  })

  it('keeps final-exam material out of the teaching harness', () => {
    assert.ok(
      decideResidencyEvidence({ ...base, finalExamMaterialUsed: true })
        .blockers.includes('residency_final_exam_material_forbidden'),
    )
  })

  it('fails closed outside supervised sandbox/exact-artifact binding', () => {
    assert.equal(decideResidencyEvidence({ ...base, sandboxed: false }).accepted, false)
    assert.equal(decideResidencyEvidence({ ...base, supervised: false }).accepted, false)
    assert.equal(decideResidencyEvidence({ ...base, exactArtifactBound: false }).accepted, false)
    assert.equal(decideResidencyEvidence({ ...base, productionMutationObserved: true }).accepted, false)
    assert.equal(decideResidencyEvidence({ ...base, authorityExpanded: true }).accepted, false)
  })

  it('does not let duplicate variants manufacture competency', () => {
    const evidence = [
      {
        competencyId: 'root_cause_diagnosis',
        variantHash: v,
        outcome: 'pass' as const,
        observedAt: '2026-09-20T10:00:00Z',
        accepted: true,
      },
      {
        competencyId: 'root_cause_diagnosis',
        variantHash: v,
        outcome: 'pass' as const,
        observedAt: '2026-09-20T11:00:00Z',
        accepted: true,
      },
    ]
    const assessment = assessBuilderResidency(evidence)
    assert.equal(
      assessment.competencies.find(item => item.competencyId === 'root_cause_diagnosis')?.state,
      'supervised',
    )
  })

  it('turns failure into remediation until two newer distinct passes exist', () => {
    const v2 = 'e'.repeat(64)
    const v3 = 'f'.repeat(64)
    const v4 = '1'.repeat(64)

    const first = assessBuilderResidency([
      { competencyId: 'root_cause_diagnosis', variantHash: v, outcome: 'pass', observedAt: '2026-09-20T10:00:00Z', accepted: true },
      { competencyId: 'root_cause_diagnosis', variantHash: v2, outcome: 'fail', observedAt: '2026-09-20T11:00:00Z', accepted: true },
      { competencyId: 'root_cause_diagnosis', variantHash: v3, outcome: 'pass', observedAt: '2026-09-20T12:00:00Z', accepted: true },
    ])
    assert.equal(
      first.competencies.find(item => item.competencyId === 'root_cause_diagnosis')?.state,
      'remediation_required',
    )

    const repaired = assessBuilderResidency([
      { competencyId: 'root_cause_diagnosis', variantHash: v2, outcome: 'fail', observedAt: '2026-09-20T11:00:00Z', accepted: true },
      { competencyId: 'root_cause_diagnosis', variantHash: v3, outcome: 'pass', observedAt: '2026-09-20T12:00:00Z', accepted: true },
      { competencyId: 'root_cause_diagnosis', variantHash: v4, outcome: 'pass', observedAt: '2026-09-20T13:00:00Z', accepted: true },
    ])
    assert.equal(
      repaired.competencies.find(item => item.competencyId === 'root_cause_diagnosis')?.state,
      'demonstrated',
    )
  })

  it('keeps final gating shadow-safe until the practical runner is ready', () => {
    assert.equal(finalEvaluationResidencyGate({
      subjectId: 'Computer Science & Coding',
      gateEnforced: false,
      residencyComplete: false,
    }).allowed, true)
    assert.equal(finalEvaluationResidencyGate({
      subjectId: 'Computer Science & Coding',
      gateEnforced: true,
      residencyComplete: false,
    }).allowed, false)
    assert.equal(finalEvaluationResidencyGate({
      subjectId: 'Computer Science & Coding',
      gateEnforced: true,
      residencyComplete: true,
    }).allowed, true)
  })

  it('starts Builder with practical competency families', () => {
    assert.ok(BUILDER_RESIDENCY_V1_COMPETENCIES.length >= 12)
  })
})
