import { createHash } from 'node:crypto'
import type { CodeRepairIndependentReview, CodeRepairModelProvider, CodeRepairReviewInput } from './provider-contracts.ts'

interface ReviewPayload {
  verdict: 'approve' | 'reject' | 'needs_changes'
  confidence: number
  summary: string
  findings: string[]
}

function parseReview(content: string): ReviewPayload {
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch {
    throw new Error('Independent reviewer returned invalid JSON.')
  }
  if (!value || typeof value !== 'object') throw new Error('Independent reviewer returned an invalid payload.')
  const candidate = value as Partial<ReviewPayload>
  if (!['approve', 'reject', 'needs_changes'].includes(candidate.verdict ?? '')) throw new Error('Independent reviewer returned an invalid verdict.')
  if (typeof candidate.confidence !== 'number' || candidate.confidence < 0 || candidate.confidence > 1) throw new Error('Independent reviewer returned invalid confidence.')
  if (typeof candidate.summary !== 'string' || !candidate.summary.trim()) throw new Error('Independent reviewer returned an empty summary.')
  if (!Array.isArray(candidate.findings) || candidate.findings.some(item => typeof item !== 'string')) throw new Error('Independent reviewer returned invalid findings.')
  return {
    verdict: candidate.verdict as ReviewPayload['verdict'],
    confidence: candidate.confidence,
    summary: candidate.summary.trim().slice(0, 2_000),
    findings: candidate.findings.map(item => item.trim().slice(0, 1_000)).filter(Boolean).slice(0, 20),
  }
}

export async function independentlyReviewCodeRepair(
  provider: CodeRepairModelProvider,
  input: CodeRepairReviewInput,
): Promise<CodeRepairIndependentReview> {
  if (input.proposal.planId !== input.plan.planId) throw new Error('Proposal does not belong to the supplied repair plan.')
  if (input.validation.proposalId !== input.proposal.proposalId) throw new Error('Validation report does not belong to the supplied proposal.')
  const response = await provider.complete({
    requestId: `review:${input.proposal.proposalId}`,
    systemInstruction: 'Act as an independent code-repair reviewer. Return strict JSON with verdict, confidence, summary, and findings. Reject scope expansion, missing validation, unsafe paths, security weakening, or unsupported claims.',
    userInstruction: JSON.stringify({
      problem: input.plan.problem,
      rationale: input.plan.rationale,
      allowedFiles: input.plan.filesAllowedToModify,
      proposal: input.proposal.unifiedDiff,
      validation: input.validation,
    }),
    maximumOutputCharacters: 12_000,
  })
  if (response.finishReason !== 'stop') throw new Error(`Independent reviewer did not complete successfully: ${response.finishReason}.`)
  const parsed = parseReview(response.content)
  const validationPassed = input.validation.validated && input.validation.cleanupSucceeded
  const verdict = validationPassed ? parsed.verdict : 'reject'
  const reviewId = createHash('sha256')
    .update(`${input.proposal.proposalId}:${response.provider}:${response.model}:${response.content}:${validationPassed}`)
    .digest('hex')
    .slice(0, 24)
  return Object.freeze({
    reviewId: `repair-review:${reviewId}`,
    proposalId: input.proposal.proposalId,
    provider: response.provider,
    model: response.model,
    verdict,
    confidence: parsed.confidence,
    summary: validationPassed ? parsed.summary : 'Validation did not pass; the proposal is rejected.',
    findings: Object.freeze(validationPassed ? parsed.findings : ['Validation or cleanup did not complete successfully.', ...parsed.findings]),
    validationPassed,
    requiresHumanApproval: true,
    applicationAllowed: false,
    mergeAllowed: false,
  })
}
