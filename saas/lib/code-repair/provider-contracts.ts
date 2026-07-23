import type { CodeRepairPlan } from './diagnosis-contracts.ts'
import type { CodeRepairPatchProposal, CodeRepairPatchValidationReport } from './patch-contracts.ts'

export interface CodeRepairProviderRequest {
  requestId: string
  systemInstruction: string
  userInstruction: string
  maximumOutputCharacters: number
}

export interface CodeRepairProviderResponse {
  provider: string
  model: string
  content: string
  finishReason: 'stop' | 'length' | 'refusal' | 'error'
}

export interface CodeRepairModelProvider {
  complete(request: CodeRepairProviderRequest): Promise<CodeRepairProviderResponse>
}

export interface CodeRepairPatchGenerationInput {
  plan: CodeRepairPlan
  baseCommitSha: string
  fileContents: Readonly<Record<string, string>>
}

export interface CodeRepairIndependentReview {
  reviewId: string
  proposalId: string
  provider: string
  model: string
  verdict: 'approve' | 'reject' | 'needs_changes'
  confidence: number
  summary: string
  findings: readonly string[]
  validationPassed: boolean
  requiresHumanApproval: true
  applicationAllowed: false
  mergeAllowed: false
}

export interface CodeRepairReviewInput {
  plan: CodeRepairPlan
  proposal: CodeRepairPatchProposal
  validation: CodeRepairPatchValidationReport
}
