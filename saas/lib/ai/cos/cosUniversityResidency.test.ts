import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BUILDER_RESIDENCY_V1_COMPETENCIES,
  decideResidencyEvidence,
} from './cosUniversityResidency.ts'

const h = 'a'.repeat(64)
const v = 'b'.repeat(64)
const t = 'c'.repeat(64)

const base = {
  candidateId: 'mass:test:0123456789abcdef',
  trainedArtifactHash: h,
  subjectId: 'computer_science_coding',
  caseFamily: 'broken_deployment',
  variantHash: v,
  competencyId: 'root_cause_diagnosis',
  state: 'demonstrated' as const,
  sandboxed: true,
  exactArtifactVerified: true,
  independentEvaluationPassed: true,
  authorityExpanded: false,
  productionMutationObserved: false,
  toolTrajectoryEvidenceHash: t,
}

describe('COS University Residency', () => {
  it('records competency without granting promotion or Production traffic', () => {
    const decision = decideResidencyEvidence(base)
    assert.equal(decision.accepted, true)
    assert.match(decision.evidenceHash ?? '', /^[a-f0-9]{64}$/)
    assert.equal(decision.promotionAuthorized, false)
    assert.equal(decision.productionTrafficAuthorized, false)
    assert.equal(decision.authorityExpanded, false)
  })

  it('fails closed without academic/exact-artifact admission', () => {
    assert.ok(
      decideResidencyEvidence({ ...base, exactArtifactVerified: false })
        .blockers.includes('residency_exact_artifact_proof_required'),
    )
    assert.ok(
      decideResidencyEvidence({ ...base, independentEvaluationPassed: false })
        .blockers.includes('residency_independent_evaluation_required'),
    )
  })

  it('forbids Production mutation and authority expansion', () => {
    assert.equal(
      decideResidencyEvidence({ ...base, productionMutationObserved: true }).accepted,
      false,
    )
    assert.equal(
      decideResidencyEvidence({ ...base, authorityExpanded: true }).accepted,
      false,
    )
  })

  it('starts Builder with practical competency families', () => {
    assert.ok(BUILDER_RESIDENCY_V1_COMPETENCIES.length >= 12)
  })
})
