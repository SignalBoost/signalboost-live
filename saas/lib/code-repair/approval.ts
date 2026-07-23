import { createHash } from 'node:crypto'
import type { CodeRepairPatchProposal, CodeRepairPatchValidationReport } from './patch-contracts.ts'
import type { CodeRepairIndependentReview } from './provider-contracts.ts'

const TOKEN_VERSION = 1
const MAX_REASON_LENGTH = 2_000

export type CodeRepairApprovalAuditAction = 'issued' | 'verified' | 'consumed' | 'revoked' | 'rejected'

export interface CodeRepairOperatorIdentity {
  operatorId: string
  displayName?: string
}

/** An immutable authorization for a future, separately governed repair application. */
export interface CodeRepairApprovalToken {
  version: 1
  tokenId: string
  proposalId: string
  proposalFingerprint: string
  validationReportFingerprint: string
  reviewFingerprint: string
  operator: Readonly<CodeRepairOperatorIdentity>
  reason: string
  issuedAt: number
  expiresAt: number
  applicationAllowed: false
  mergeAllowed: false
}

export interface CodeRepairApprovalAuditRecord {
  action: CodeRepairApprovalAuditAction
  tokenId: string
  at: number
  operatorId: string | null
  reason: string | null
  detail: string | null
}

export interface CodeRepairApprovalIssueInput {
  proposal: CodeRepairPatchProposal
  validation: CodeRepairPatchValidationReport
  review: CodeRepairIndependentReview
  operator: CodeRepairOperatorIdentity
  reason: string
  issuedAt: number
  expiresAt: number
}

export interface CodeRepairApprovalVerificationInput {
  token: CodeRepairApprovalToken
  proposal: CodeRepairPatchProposal
  validation: CodeRepairPatchValidationReport
  review: CodeRepairIndependentReview
  at: number
  consume?: boolean
}

export type CodeRepairApprovalVerification = Readonly<{
  authorized: boolean
  code: 'authorized' | 'expired' | 'revoked' | 'consumed' | 'unknown_token' | 'inconsistent'
  token: CodeRepairApprovalToken | null
}>

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`
}

function fingerprint(prefix: string, value: unknown): string {
  return `${prefix}:${createHash('sha256').update(canonical(value)).digest('hex')}`
}

function frozenToken(token: CodeRepairApprovalToken): CodeRepairApprovalToken {
  return Object.freeze({ ...token, operator: Object.freeze({ ...token.operator }) })
}

function assertFiniteTimestamp(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Approval ${name} must be a non-negative integer timestamp.`)
}

function assertBindings(input: Pick<CodeRepairApprovalIssueInput, 'proposal' | 'validation' | 'review'>): void {
  if (!input.proposal.proposalId.trim()) throw new Error('Approval requires a proposal ID.')
  if (input.validation.proposalId !== input.proposal.proposalId) throw new Error('Approval validation report does not belong to the proposal.')
  if (input.review.proposalId !== input.proposal.proposalId) throw new Error('Approval review does not belong to the proposal.')
  if (!input.validation.validated || !input.validation.cleanupSucceeded || input.validation.repositoryModified || input.validation.networkAccessAllowed) throw new Error('Approval requires a successful isolated validation report.')
  if (input.review.verdict !== 'approve' || !input.review.validationPassed || !input.review.requiresHumanApproval || input.review.applicationAllowed || input.review.mergeAllowed) throw new Error('Approval requires an approving, non-applying independent review.')
  if (!input.proposal.requiresHumanApproval || input.proposal.applicationAllowed || input.proposal.mergeAllowed) throw new Error('Approval requires a non-applying proposal.')
}

export function fingerprintCodeRepairProposal(proposal: CodeRepairPatchProposal): string {
  return fingerprint('repair-proposal', proposal)
}

export function fingerprintCodeRepairValidationReport(report: CodeRepairPatchValidationReport): string {
  return fingerprint('repair-validation', report)
}

export function fingerprintCodeRepairReview(review: CodeRepairIndependentReview): string {
  return fingerprint('repair-review', review)
}

/** Creates a deterministic, immutable token; issuing it never applies a patch or performs Git work. */
export function createCodeRepairApprovalToken(input: CodeRepairApprovalIssueInput): CodeRepairApprovalToken {
  assertBindings(input)
  if (!input.operator.operatorId?.trim()) throw new Error('Approval requires an operator identity.')
  if (!input.reason?.trim() || input.reason.trim().length > MAX_REASON_LENGTH) throw new Error('Approval reason is required and must be bounded.')
  assertFiniteTimestamp(input.issuedAt, 'issuedAt'); assertFiniteTimestamp(input.expiresAt, 'expiresAt')
  if (input.expiresAt <= input.issuedAt) throw new Error('Approval expiration must be after issuance.')
  const proposalFingerprint = fingerprintCodeRepairProposal(input.proposal)
  const validationReportFingerprint = fingerprintCodeRepairValidationReport(input.validation)
  const reviewFingerprint = fingerprintCodeRepairReview(input.review)
  const tokenId = fingerprint('repair-approval', { version: TOKEN_VERSION, proposalFingerprint, validationReportFingerprint, reviewFingerprint, operatorId: input.operator.operatorId.trim(), reason: input.reason.trim(), issuedAt: input.issuedAt, expiresAt: input.expiresAt })
  return frozenToken({ version: TOKEN_VERSION, tokenId, proposalId: input.proposal.proposalId, proposalFingerprint, validationReportFingerprint, reviewFingerprint, operator: { operatorId: input.operator.operatorId.trim(), ...(input.operator.displayName?.trim() ? { displayName: input.operator.displayName.trim() } : {}) }, reason: input.reason.trim(), issuedAt: input.issuedAt, expiresAt: input.expiresAt, applicationAllowed: false, mergeAllowed: false })
}

export function serializeCodeRepairApprovalToken(token: CodeRepairApprovalToken): string { return canonical(token) }

export function deserializeCodeRepairApprovalToken(serialized: string): CodeRepairApprovalToken {
  let value: unknown
  try { value = JSON.parse(serialized) } catch { throw new Error('Approval token serialization is invalid.') }
  if (canonical(value) !== serialized) throw new Error('Approval token serialization is not canonical.')
  const token = value as CodeRepairApprovalToken
  if (!token || token.version !== TOKEN_VERSION || typeof token.tokenId !== 'string' || typeof token.proposalId !== 'string' || typeof token.proposalFingerprint !== 'string' || typeof token.validationReportFingerprint !== 'string' || typeof token.reviewFingerprint !== 'string' || !token.operator || typeof token.operator.operatorId !== 'string' || typeof token.reason !== 'string' || token.applicationAllowed !== false || token.mergeAllowed !== false) throw new Error('Approval token contract is invalid.')
  assertFiniteTimestamp(token.issuedAt, 'issuedAt'); assertFiniteTimestamp(token.expiresAt, 'expiresAt')
  if (token.expiresAt <= token.issuedAt) throw new Error('Approval expiration must be after issuance.')
  return frozenToken(token)
}

/** In-memory authorization service. Persistence adapters may mirror its immutable audit records, never auto-apply repairs. */
export class CodeRepairApprovalService {
  private readonly tokens = new Map<string, CodeRepairApprovalToken>()
  private readonly consumed = new Set<string>()
  private readonly revoked = new Set<string>()
  private readonly records: CodeRepairApprovalAuditRecord[] = []

  issue(input: CodeRepairApprovalIssueInput): CodeRepairApprovalToken {
    const token = createCodeRepairApprovalToken(input)
    const existing = this.tokens.get(token.tokenId)
    if (existing && serializeCodeRepairApprovalToken(existing) !== serializeCodeRepairApprovalToken(token)) throw new Error('Approval token collision detected.')
    if (!existing) { this.tokens.set(token.tokenId, token); this.audit('issued', token, input.issuedAt, token.operator.operatorId, token.reason, null) }
    return token
  }

  revoke(tokenId: string, operator: CodeRepairOperatorIdentity, reason: string, at: number): boolean {
    const token = this.tokens.get(tokenId)
    if (!token || !operator.operatorId?.trim() || !reason?.trim()) return false
    assertFiniteTimestamp(at, 'revocation time')
    if (this.revoked.has(tokenId)) return false
    this.revoked.add(tokenId); this.audit('revoked', token, at, operator.operatorId.trim(), reason.trim().slice(0, MAX_REASON_LENGTH), null)
    return true
  }

  verify(input: CodeRepairApprovalVerificationInput): CodeRepairApprovalVerification {
    const token = this.tokens.get(input.token.tokenId)
    const rejected = (code: Exclude<CodeRepairApprovalVerification['code'], 'authorized'>, detail: string): CodeRepairApprovalVerification => {
      if (token) this.audit('rejected', token, input.at, null, null, detail)
      return Object.freeze({ authorized: false, code, token: null })
    }
    if (!token || serializeCodeRepairApprovalToken(token) !== serializeCodeRepairApprovalToken(input.token)) return rejected('unknown_token', 'token_not_issued')
    assertFiniteTimestamp(input.at, 'verification time')
    if (this.revoked.has(token.tokenId)) return rejected('revoked', 'token_revoked')
    if (input.at >= token.expiresAt) return rejected('expired', 'token_expired')
    if (this.consumed.has(token.tokenId)) return rejected('consumed', 'token_already_consumed')
    try {
      assertBindings(input)
      if (token.proposalId !== input.proposal.proposalId || token.proposalFingerprint !== fingerprintCodeRepairProposal(input.proposal) || token.validationReportFingerprint !== fingerprintCodeRepairValidationReport(input.validation) || token.reviewFingerprint !== fingerprintCodeRepairReview(input.review)) return rejected('inconsistent', 'binding_mismatch')
    } catch { return rejected('inconsistent', 'invalid_bound_artifact') }
    this.audit('verified', token, input.at, null, null, null)
    if (input.consume !== false) { this.consumed.add(token.tokenId); this.audit('consumed', token, input.at, null, null, null) }
    return Object.freeze({ authorized: true, code: 'authorized', token })
  }

  auditHistory(): readonly CodeRepairApprovalAuditRecord[] { return Object.freeze(this.records.map(record => Object.freeze({ ...record }))) }
  private audit(action: CodeRepairApprovalAuditAction, token: CodeRepairApprovalToken, at: number, operatorId: string | null, reason: string | null, detail: string | null): void { this.records.push(Object.freeze({ action, tokenId: token.tokenId, at, operatorId, reason, detail })) }
}
