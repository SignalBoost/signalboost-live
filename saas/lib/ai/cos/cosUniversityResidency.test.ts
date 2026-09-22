import { describe, expect, it } from 'vitest'
import {
  BUILDER_RESIDENCY_V1_COMPETENCIES,
  assessBuilderResidency,
  decideResidencyAdmission,
  decideResidencyEvidence,
  finalEvaluationResidencyGate,
} from './cosUniversityResidency'

const h='a'.repeat(64), v='b'.repeat(64), t='c'.repeat(64), r='d'.repeat(64)

const base={
  candidateId:'mass:test:0123456789abcdef',
  trainedArtifactHash:h,
  subjectId:'computer_science_coding',
  caseFamily:'broken_deployment',
  variantHash:v,
  competencyId:'root_cause_diagnosis',
  outcome:'pass' as const,
  observedAt:'2026-09-22T12:00:00Z',
  sandboxed:true,
  supervised:true,
  exactArtifactBound:true,
  finalExamMaterialUsed:false,
  authorityExpanded:false,
  productionMutationObserved:false,
  toolTrajectoryEvidenceHash:t,
}

describe('COS University Residency',()=>{
  it('admits a trained student before final canary/evaluation',()=>{
    const d=decideResidencyAdmission({
      artifactRowId:'artifact-row-1',
      candidateId:base.candidateId,
      subjectId:'Computer Science & Coding',
      trainedArtifactId:'cadomos/itmounts-student-test',
      trainedArtifactHash:h,
      revisionKey:r,
      artifactStatus:'evaluation_pending',
      authorityExpanded:false,
    })
    expect(d.eligible).toBe(true)
    expect(d.formalEducationStage).toBe('practical_residency')
    expect(d.promotionAuthorized).toBe(false)
  })

  it('records supervised practical evidence without requiring a final-exam pass',()=>{
    const d=decideResidencyEvidence(base)
    expect(d.accepted).toBe(true)
    expect(d.evidenceHash).toMatch(/^[a-f0-9]{64}$/)
    expect(d.promotionAuthorized).toBe(false)
    expect(d.productionTrafficAuthorized).toBe(false)
  })

  it('keeps final-exam material out of the teaching harness',()=>{
    expect(decideResidencyEvidence({...base,finalExamMaterialUsed:true}).blockers)
      .toContain('residency_final_exam_material_forbidden')
  })

  it('fails closed outside supervised sandbox/exact-artifact binding',()=>{
    expect(decideResidencyEvidence({...base,sandboxed:false}).accepted).toBe(false)
    expect(decideResidencyEvidence({...base,supervised:false}).accepted).toBe(false)
    expect(decideResidencyEvidence({...base,exactArtifactBound:false}).accepted).toBe(false)
    expect(decideResidencyEvidence({...base,productionMutationObserved:true}).accepted).toBe(false)
    expect(decideResidencyEvidence({...base,authorityExpanded:true}).accepted).toBe(false)
  })

  it('does not let duplicate variants manufacture competency',()=>{
    const evidence=[
      {competencyId:'root_cause_diagnosis',variantHash:v,outcome:'pass' as const,observedAt:'2026-09-20T10:00:00Z',accepted:true},
      {competencyId:'root_cause_diagnosis',variantHash:v,outcome:'pass' as const,observedAt:'2026-09-20T11:00:00Z',accepted:true},
    ]
    const a=assessBuilderResidency(evidence)
    expect(a.competencies.find(x=>x.competencyId==='root_cause_diagnosis')?.state).toBe('supervised')
  })

  it('turns verified failure into remediation until two newer distinct passes exist',()=>{
    const v2='e'.repeat(64), v3='f'.repeat(64), v4='1'.repeat(64)
    const first=assessBuilderResidency([
      {competencyId:'root_cause_diagnosis',variantHash:v,outcome:'pass',observedAt:'2026-09-20T10:00:00Z',accepted:true},
      {competencyId:'root_cause_diagnosis',variantHash:v2,outcome:'fail',observedAt:'2026-09-20T11:00:00Z',accepted:true},
      {competencyId:'root_cause_diagnosis',variantHash:v3,outcome:'pass',observedAt:'2026-09-20T12:00:00Z',accepted:true},
    ])
    expect(first.competencies.find(x=>x.competencyId==='root_cause_diagnosis')?.state).toBe('remediation_required')

    const repaired=assessBuilderResidency([
      {competencyId:'root_cause_diagnosis',variantHash:v2,outcome:'fail',observedAt:'2026-09-20T11:00:00Z',accepted:true},
      {competencyId:'root_cause_diagnosis',variantHash:v3,outcome:'pass',observedAt:'2026-09-20T12:00:00Z',accepted:true},
      {competencyId:'root_cause_diagnosis',variantHash:v4,outcome:'pass',observedAt:'2026-09-20T13:00:00Z',accepted:true},
    ])
    expect(repaired.competencies.find(x=>x.competencyId==='root_cause_diagnosis')?.state).toBe('demonstrated')
  })

  it('keeps final gating shadow-safe until the practical runner is ready',()=>{
    expect(finalEvaluationResidencyGate({
      subjectId:'Computer Science & Coding',
      gateEnforced:false,
      residencyComplete:false,
    }).allowed).toBe(true)
    expect(finalEvaluationResidencyGate({
      subjectId:'Computer Science & Coding',
      gateEnforced:true,
      residencyComplete:false,
    }).allowed).toBe(false)
    expect(finalEvaluationResidencyGate({
      subjectId:'Computer Science & Coding',
      gateEnforced:true,
      residencyComplete:true,
    }).allowed).toBe(true)
  })

  it('starts Builder with practical competency families',()=>{
    expect(BUILDER_RESIDENCY_V1_COMPETENCIES.length).toBeGreaterThanOrEqual(12)
  })
})
