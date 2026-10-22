// saas/lib/builder/collaborate-approval.ts
//
// Work with me: Builder verified the work in its sandbox and paused before anything left it. The user's "go" in the
// same conversation starts one publish-only job bound to that paused job and to the exact files it verified.

import { createHash } from 'node:crypto'
import type { BuilderJobRecord } from './job-store.ts'

export type AwaitingPublication = Readonly<{ action: 'isolated_publication'; fingerprint: string }>

/** The paused job's approval request, or null when the job is not waiting for one. */
export function awaitingPublication(job: BuilderJobRecord | null): AwaitingPublication | null {
  const awaiting = (job?.result as { awaitingApproval?: { action?: unknown; fingerprint?: unknown } } | null)?.awaitingApproval
  return job?.status === 'succeeded' && awaiting?.action === 'isolated_publication' && typeof awaiting.fingerprint === 'string' && awaiting.fingerprint
    ? { action: 'isolated_publication', fingerprint: awaiting.fingerprint } : null
}

/** A Work with me live-site repair waiting for the owner: PR created, merge held, job paused until it merges. */
export function awaitingRepositoryMerge(job: BuilderJobRecord | null): Readonly<{ pullRequestNumber: number }> | null {
  const result = (job?.result ?? {}) as { repository_merge_pending?: unknown; pull_request_number?: unknown }
  const pullRequestNumber = Number(result.pull_request_number)
  return job?.status === 'paused' && job.ownerAuthorized === true && job.metadata.platformRepair === true
    && job.metadata.assistanceMode === 'collaborate' && result.repository_merge_pending === true
    && Number.isInteger(pullRequestNumber) && pullRequestNumber > 0 ? { pullRequestNumber } : null
}

/** One approval job per paused job: a repeated "go" (or a resent request) finds the same job instead of publishing twice. */
export function approvalJobId(sourceJobId: string): string {
  const hex = createHash('sha256').update(`builder-approved-publication:${sourceJobId}`).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

export type ApprovalOutcome =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'source_changed' }>
  | Readonly<{ kind: 'started'; jobId: string; sourceJobId: string; workspaceId: string }>

export async function startApprovedIsolatedPublication(input: Readonly<{
  userId: string
  conversationId: string
  responseLanguage: string
  runningReply: string
  readLatestJob: (lookup: { userId: string; conversationId: string }) => Promise<BuilderJobRecord | null>
  fingerprint: (userId: string, workspaceId: string) => Promise<string>
  enqueue: (job: {
    jobId: string; workspaceId: string; userId: string; conversationId: string; objective: string
    jobKind: 'standard'; metadata: Record<string, unknown>; ownerAuthorized: boolean; runningReply: string
  }) => Promise<unknown>
  jobExists: (jobId: string, userId: string) => Promise<boolean>
}>): Promise<ApprovalOutcome> {
  const source = await input.readLatestJob({ userId: input.userId, conversationId: input.conversationId })
  const awaiting = awaitingPublication(source)
  if (!source || !awaiting) return { kind: 'none' }
  if (await input.fingerprint(input.userId, source.workspaceId) !== awaiting.fingerprint) return { kind: 'source_changed' }
  const jobId = approvalJobId(source.id)
  try {
    await input.enqueue({
      jobId, workspaceId: source.workspaceId, userId: input.userId, conversationId: source.conversationId,
      objective: source.objective, jobKind: 'standard', ownerAuthorized: source.ownerAuthorized,
      metadata: { builderEngine: 'v2', approvedPublicationOf: source.id, approvedWorkspaceFingerprint: awaiting.fingerprint,
        assistanceMode: 'collaborate', responseLanguage: input.responseLanguage },
      runningReply: input.runningReply,
    })
  } catch (error) {
    // The same approval already queued this job: report it, never queue a second publication.
    if (!await input.jobExists(jobId, input.userId)) throw error
  }
  return { kind: 'started', jobId, sourceJobId: source.id, workspaceId: source.workspaceId }
}
