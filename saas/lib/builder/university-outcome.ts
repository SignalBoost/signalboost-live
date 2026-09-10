import { recordVerifiedCosProductionOutcome, type CosVerifiedOutcomeStatus } from '@/lib/ai/cos/cognitiveVerifiedOutcome'

export const BUILDER_UNIVERSITY_AGENT_ID = 'software-specialist'
export const BUILDER_UNIVERSITY_SUBJECT_ID = 'computer_science'

type BuilderUniversityOutcomeJob = Readonly<{
  id: string
  claimGeneration: number
  finishedAt?: string | null
}>

/**
 * Records Builder's host-observed terminal result as raw Production evidence. This deliberately
 * does not manufacture an academic envelope: independent baseline, transfer, retention and source
 * evidence must be supplied by the University controller before the outcome can affect a grade.
 */
export async function recordBuilderUniversityProductionOutcome(input: {
  job: BuilderUniversityOutcomeJob
  status: CosVerifiedOutcomeStatus
  verification: string
  facts?: Record<string, unknown>
}): Promise<void> {
  await recordVerifiedCosProductionOutcome({
    sourceClass: 'production_outcome',
    sourceRef: `builder_job:${input.job.id}:${input.job.claimGeneration}`,
    domain: 'workflow',
    outcomeStatus: input.status,
    summary: `Software Specialist Builder terminal outcome: ${input.status}.`,
    problemClass: BUILDER_UNIVERSITY_SUBJECT_ID,
    correlation: { kind: 'builder_job_id', value: input.job.id },
    idempotencyKey: `builder-university:${input.job.id}:${input.job.claimGeneration}`,
    occurredAt: input.job.finishedAt || undefined,
    facts: {
      agentId: BUILDER_UNIVERSITY_AGENT_ID,
      subjectId: BUILDER_UNIVERSITY_SUBJECT_ID,
      verification: input.verification,
      authorityGranted: false,
      ...input.facts,
    },
    universityEvidence: null,
  })
}
