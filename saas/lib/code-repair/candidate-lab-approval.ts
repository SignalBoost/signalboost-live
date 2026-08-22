import { fingerprintCodeRepairProposal } from './approval.ts'
import type { CandidateLabEvidence } from './candidate-lab.ts'
import type { CodeRepairPatchProposal, CodeRepairPatchValidationReport } from './patch-contracts.ts'
import type { CodeRepairIndependentReview } from './provider-contracts.ts'

export interface CandidateLabHumanReviewPacket {
  proposal: CodeRepairPatchProposal
  evidence: CandidateLabEvidence
  validation: CodeRepairPatchValidationReport
  review: CodeRepairIndependentReview
  humanApprovalRequired: true
  applicationAllowed: false
  mergeAllowed: false
}

/** Produces an immutable, approval-only packet; it never issues approval by itself. */
export function createCandidateLabHumanReviewPacket(
  proposal: CodeRepairPatchProposal,
  evidence: CandidateLabEvidence,
  validation: CodeRepairPatchValidationReport,
  review: CodeRepairIndependentReview,
): CandidateLabHumanReviewPacket {
  if (evidence.candidateChangeFingerprint !== fingerprintCodeRepairProposal(proposal)) throw new Error('Candidate Lab evidence is not bound to this patch proposal.')
  if (!evidence.evaluation.recommendedForHumanReview || evidence.automaticPromotionAllowed || !evidence.humanApprovalRequired) throw new Error('Candidate Lab evidence is not eligible for human review.')
  if (!validation.validated || !validation.cleanupSucceeded || validation.repositoryModified || validation.networkAccessAllowed || validation.proposalId !== proposal.proposalId) throw new Error('Candidate Lab requires a clean isolated validation report.')
  if (review.proposalId !== proposal.proposalId || review.verdict !== 'approve' || !review.validationPassed || !review.requiresHumanApproval || review.applicationAllowed || review.mergeAllowed) throw new Error('Candidate Lab requires an approval-only independent review.')
  return Object.freeze({ proposal, evidence, validation, review, humanApprovalRequired: true, applicationAllowed: false, mergeAllowed: false })
}
