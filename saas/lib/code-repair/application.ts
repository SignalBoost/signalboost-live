// saas/lib/code-repair/application.ts
import { createHash } from 'node:crypto'
import {
  CodeRepairApprovalService,
  fingerprintCodeRepairProposal,
  serializeCodeRepairApprovalToken,
} from './approval.ts'
import type { CodeRepairApprovalToken } from './approval.ts'
import type { CandidateLabHumanReviewPacket } from './candidate-lab-approval.ts'
import type { CodeRepairPatchProposal, CodeRepairPatchValidationReport } from './patch-contracts.ts'
import type { CodeRepairIndependentReview } from './provider-contracts.ts'
import { parseUnifiedDiff } from './unified-diff.ts'

/** This gate is intentionally constant: V1 can only stage a disposable dry run. */
export const CODE_REPAIR_REPOSITORY_MUTATION_ENABLED = false

export type CodeRepairExecutionFailure =
  | 'proposal_fingerprint_mismatch' | 'approval_token_invalid' | 'validation_report_invalid'
  | 'independent_review_invalid' | 'workspace_integrity_invalid' | 'patch_integrity_invalid'
  | 'repository_mutation_disabled' | 'workspace_operation_failed' | 'candidate_lab_packet_invalid'

export interface CodeRepairDisposableWorkspace {
  id: string
  root: string
  baseCommitSha: string
  isolation: 'disposable'
  productionRepository: false
}

/** Implementations must create an isolated copy; they must never return the source repository. */
export interface CodeRepairDisposableWorkspaceManager {
  create(input: { workspaceId: string; baseCommitSha: string }): Promise<CodeRepairDisposableWorkspace>
  verifyIntegrity(workspace: CodeRepairDisposableWorkspace, expectedBaseCommitSha: string): Promise<boolean>
  stageUnifiedDiff(workspace: CodeRepairDisposableWorkspace, unifiedDiff: string): Promise<void>
  prepareRollback(workspace: CodeRepairDisposableWorkspace, proposal: CodeRepairPatchProposal): Promise<{ rollbackId: string; baseCommitSha: string }>
  destroy(workspace: CodeRepairDisposableWorkspace): Promise<void>
}

export interface CodeRepairExecutionAuditRecord {
  executionId: string
  at: number
  event: 'started' | 'verified' | 'dry_run_staged' | 'rollback_prepared' | 'failed' | 'cleanup_completed' | 'cleanup_failed'
  detail: string
}

export interface CodeRepairExecutionAuditSink { append(record: CodeRepairExecutionAuditRecord): Promise<void> }

export class InMemoryCodeRepairExecutionAuditSink implements CodeRepairExecutionAuditSink {
  private readonly records: CodeRepairExecutionAuditRecord[] = []
  async append(record: CodeRepairExecutionAuditRecord): Promise<void> { this.records.push(Object.freeze({ ...record })) }
  history(): readonly CodeRepairExecutionAuditRecord[] { return Object.freeze(this.records.map(record => Object.freeze({ ...record }))) }
}

export interface CodeRepairExecutionMetrics { attempted: number; succeeded: number; failed: number; cleanedUp: number; cleanupFailed: number }
export class CodeRepairExecutionMetricsCollector {
  private metrics: CodeRepairExecutionMetrics = { attempted: 0, succeeded: 0, failed: 0, cleanedUp: 0, cleanupFailed: 0 }
  record(name: keyof CodeRepairExecutionMetrics): void { this.metrics[name]++ }
  snapshot(): Readonly<CodeRepairExecutionMetrics> { return Object.freeze({ ...this.metrics }) }
}

export interface CodeRepairDryRunRequest {
  executionId: string
  at: number
  expectedProposalFingerprint: string
  proposal: CodeRepairPatchProposal
  approvalToken: CodeRepairApprovalToken
  validation: CodeRepairPatchValidationReport
  review: CodeRepairIndependentReview
  candidateLabPacket?: CandidateLabHumanReviewPacket
}

export interface CodeRepairExecutionReport {
  executionId: string
  status: 'dry_run_staged' | 'rejected'
  failure: CodeRepairExecutionFailure | null
  verifiedSteps: readonly string[]
  rollback: { rollbackId: string; baseCommitSha: string } | null
  cleanupSucceeded: boolean
  repositoryMutationEnabled: false
}

function frozenReport(report: CodeRepairExecutionReport): CodeRepairExecutionReport { return Object.freeze({ ...report, verifiedSteps: Object.freeze([...report.verifiedSteps]), rollback: report.rollback ? Object.freeze({ ...report.rollback }) : null }) }
function validValidation(p: CodeRepairPatchProposal, v: CodeRepairPatchValidationReport): boolean { return v.proposalId === p.proposalId && v.validated && v.cleanupSucceeded && !v.repositoryModified && !v.networkAccessAllowed }
function validReview(p: CodeRepairPatchProposal, r: CodeRepairIndependentReview): boolean { return r.proposalId === p.proposalId && r.verdict === 'approve' && r.validationPassed && r.requiresHumanApproval && !r.applicationAllowed && !r.mergeAllowed }
function validPatch(p: CodeRepairPatchProposal): boolean {
  try {
    const parsed = parseUnifiedDiff(p.unifiedDiff)
    return parsed.length === p.files.length && parsed.every((file, i) => {
      const expected = p.files[i]
      return file.path === expected.path && file.previousPath === expected.previousPath && file.additions === expected.additions && file.deletions === expected.deletions && file.hunks === expected.hunks && file.diff === expected.diff
    }) && parsed.reduce((n, f) => n + f.additions, 0) === p.totalAdditions && parsed.reduce((n, f) => n + f.deletions, 0) === p.totalDeletions
  } catch { return false }
}

/**
 * Applies only to a disposable workspace and only as a dry-run staging operation.
 * No Git commands, commits, pushes, merge operations, or production filesystem writes exist here.
 */
export class CodeRepairApplicationOrchestrator {
  private readonly approvals: CodeRepairApprovalService
  private readonly workspaces: CodeRepairDisposableWorkspaceManager
  private readonly audit: CodeRepairExecutionAuditSink
  private readonly metrics: CodeRepairExecutionMetricsCollector
  constructor(approvals: CodeRepairApprovalService,workspaces: CodeRepairDisposableWorkspaceManager,audit: CodeRepairExecutionAuditSink = new InMemoryCodeRepairExecutionAuditSink(),metrics = new CodeRepairExecutionMetricsCollector()) {
    this.approvals = approvals
    this.workspaces = workspaces
    this.audit = audit
    this.metrics = metrics
  }

  async dryRun(request: CodeRepairDryRunRequest): Promise<CodeRepairExecutionReport> {
    this.metrics.record('attempted')
    const steps: string[] = []
    const record = async (event: CodeRepairExecutionAuditRecord['event'], detail: string) => this.audit.append({ executionId: request.executionId, at: request.at, event, detail })
    const reject = async (failure: CodeRepairExecutionFailure): Promise<CodeRepairExecutionReport> => { this.metrics.record('failed'); await record('failed', failure); return frozenReport({ executionId: request.executionId, status: 'rejected', failure, verifiedSteps: steps, rollback: null, cleanupSucceeded: false, repositoryMutationEnabled: false }) }
    await record('started', 'dry_run_only')
    if (request.candidateLabPacket && (
      request.candidateLabPacket.proposal !== request.proposal ||
      request.candidateLabPacket.validation !== request.validation ||
      request.candidateLabPacket.review !== request.review ||
      !request.candidateLabPacket.evidence.evaluation.recommendedForHumanReview ||
      request.candidateLabPacket.evidence.automaticPromotionAllowed ||
      !request.candidateLabPacket.humanApprovalRequired ||
      request.candidateLabPacket.applicationAllowed ||
      request.candidateLabPacket.mergeAllowed
    )) return reject('candidate_lab_packet_invalid')
    if (!request.executionId.trim() || !Number.isSafeInteger(request.at) || request.at < 0) return reject('workspace_operation_failed')
    if (fingerprintCodeRepairProposal(request.proposal) !== request.expectedProposalFingerprint) return reject('proposal_fingerprint_mismatch')
    steps.push('proposal_fingerprint')
    // A token must be canonical and explicitly bound before any workspace is created.
    try { if (request.approvalToken.proposalFingerprint !== request.expectedProposalFingerprint || serializeCodeRepairApprovalToken(request.approvalToken) !== serializeCodeRepairApprovalToken(request.approvalToken)) return reject('approval_token_invalid') } catch { return reject('approval_token_invalid') }
    steps.push('approval_token')
    if (!validValidation(request.proposal, request.validation)) return reject('validation_report_invalid')
    steps.push('validation_report')
    if (!validReview(request.proposal, request.review)) return reject('independent_review_invalid')
    steps.push('independent_reviewer_approval')
    const authorization = this.approvals.verify({ token: request.approvalToken, proposal: request.proposal, validation: request.validation, review: request.review, at: request.at })
    if (!authorization.authorized) return reject('approval_token_invalid')
    await record('verified', 'approval_consumed_for_disposable_dry_run')
    let workspace: CodeRepairDisposableWorkspace | undefined
    let cleanupSucceeded = false
    try {
      workspace = await this.workspaces.create({ workspaceId: request.executionId, baseCommitSha: request.proposal.baseCommitSha })
      if (workspace.isolation !== 'disposable' || workspace.productionRepository !== false || workspace.baseCommitSha !== request.proposal.baseCommitSha || !(await this.workspaces.verifyIntegrity(workspace, request.proposal.baseCommitSha))) return reject('workspace_integrity_invalid')
      steps.push('workspace_integrity')
      if (!validPatch(request.proposal)) return reject('patch_integrity_invalid')
      steps.push('patch_integrity')
      if (CODE_REPAIR_REPOSITORY_MUTATION_ENABLED) return reject('repository_mutation_disabled')
      await this.workspaces.stageUnifiedDiff(workspace, request.proposal.unifiedDiff)
      await record('dry_run_staged', 'disposable_workspace_only')
      const rollback = await this.workspaces.prepareRollback(workspace, request.proposal)
      if (!rollback.rollbackId || rollback.baseCommitSha !== request.proposal.baseCommitSha) return reject('workspace_operation_failed')
      await record('rollback_prepared', rollback.rollbackId)
      this.metrics.record('succeeded')
      return frozenReport({ executionId: request.executionId, status: 'dry_run_staged', failure: null, verifiedSteps: steps, rollback, cleanupSucceeded: false, repositoryMutationEnabled: false })
    } catch { return reject('workspace_operation_failed')
    } finally {
      if (workspace) {
        try { await this.workspaces.destroy(workspace); cleanupSucceeded = true; this.metrics.record('cleanedUp'); await record('cleanup_completed', workspace.id) }
        catch { this.metrics.record('cleanupFailed'); await record('cleanup_failed', workspace.id) }
      }
    }
  }

  metricsSnapshot(): Readonly<CodeRepairExecutionMetrics> { return this.metrics.snapshot() }
}

export function fingerprintCodeRepairPatchBytes(unifiedDiff: string): string { return createHash('sha256').update(unifiedDiff).digest('hex') }
