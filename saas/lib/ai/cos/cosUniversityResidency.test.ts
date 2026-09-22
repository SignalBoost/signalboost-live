import { describe, expect, it } from 'vitest'
import { BUILDER_RESIDENCY_V1_COMPETENCIES, decideResidencyEvidence } from './cosUniversityResidency'

const h='a'.repeat(64), v='b'.repeat(64), t='c'.repeat(64)
const base={candidateId:'mass:test:0123456789abcdef',trainedArtifactHash:h,subjectId:'computer_science_coding',caseFamily:'broken_deployment',variantHash:v,competencyId:'root_cause_diagnosis',state:'demonstrated' as const,sandboxed:true,exactArtifactVerified:true,independentEvaluationPassed:true,authorityExpanded:false,productionMutationObserved:false,toolTrajectoryEvidenceHash:t}

describe('COS University Residency',()=>{
  it('records competency without granting promotion or Production traffic',()=>{
    const d=decideResidencyEvidence(base)
    expect(d.accepted).toBe(true)
    expect(d.evidenceHash).toMatch(/^[a-f0-9]{64}$/)
    expect(d.promotionAuthorized).toBe(false)
    expect(d.productionTrafficAuthorized).toBe(false)
    expect(d.authorityExpanded).toBe(false)
  })
  it('fails closed without academic/exact-artifact admission',()=>{
    expect(decideResidencyEvidence({...base,exactArtifactVerified:false}).blockers).toContain('residency_exact_artifact_proof_required')
    expect(decideResidencyEvidence({...base,independentEvaluationPassed:false}).blockers).toContain('residency_independent_evaluation_required')
  })
  it('forbids Production mutation and authority expansion',()=>{
    expect(decideResidencyEvidence({...base,productionMutationObserved:true}).accepted).toBe(false)
    expect(decideResidencyEvidence({...base,authorityExpanded:true}).accepted).toBe(false)
  })
  it('starts Builder with practical competency families',()=>expect(BUILDER_RESIDENCY_V1_COMPETENCIES.length).toBeGreaterThanOrEqual(12))
})
