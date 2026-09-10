import type { CosUniversitySubjectId } from './cosUniversity.ts'
import type { CosVerifiedProductionOutcomeDecision } from './cognitiveVerifiedOutcome.ts'

export type CosUniversityOutcomeEvidenceEnvelope = Readonly<{
  agentId: string
  subjectId: CosUniversitySubjectId
  baselineScore: number
  postStudyScore: number
  transferEvidenceRefs: readonly string[]
  delayedRetentionEvidenceRefs: readonly string[]
  sourceEvidenceRefs: readonly string[]
  productionBaseline: number
  productionCandidate: number
  higherIsBetter: boolean
  sampleSize: number
  independentScorer: boolean
}>

export function universityEvidenceFromVerifiedOutcome(
  academic: CosUniversityOutcomeEvidenceEnvelope | null | undefined,
  decision: CosVerifiedProductionOutcomeDecision,
) {
  if (!academic) return null
  return {
    agentId: academic.agentId,
    subjectId: academic.subjectId,
    evidence: {
      baselineScore: academic.baselineScore,
      postStudyScore: academic.postStudyScore,
      transferEvidenceRefs: academic.transferEvidenceRefs,
      practicalEvidenceRefs: decision.success === true ? [decision.sourceRef] : [],
      delayedRetentionEvidenceRefs: academic.delayedRetentionEvidenceRefs,
      sourceEvidenceRefs: academic.sourceEvidenceRefs,
      productionOutcome: {
        baseline: academic.productionBaseline,
        candidate: academic.productionCandidate,
        higherIsBetter: academic.higherIsBetter,
        sampleSize: academic.sampleSize,
      },
      independentScorer: academic.independentScorer,
    },
  } as const
}
