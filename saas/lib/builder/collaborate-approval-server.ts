// saas/lib/builder/collaborate-approval-server.ts
//
// Work with me approval with the real stores. Shared by /api/builder (what chat calls, authenticated as the real user
// on every surface) and the COS Software Specialist, so both apply the same rules and the same replies.

import { assistanceCopy, COLLABORATE_APPROVAL_STARTED, COLLABORATE_MERGE_AUTOMERGE_OFF, COLLABORATE_MERGE_RELEASED, COLLABORATE_SOURCE_CHANGED } from '../ai/cos/assistanceMode.ts'
import { awaitingRepositoryMerge, startApprovedIsolatedPublication } from './collaborate-approval.ts'
import { releaseRepositoryRepairMergeHold } from './repository-repair-writeback.ts'
import { enqueueBuilderJob, getBuilderJobForUser, readBuilderEvidenceJob, readBuilderWorkspaceFingerprint } from './job-store.ts'

export type PausedWorkApproval =
  | Readonly<{ status: 202; jobId: string; payload: Record<string, unknown> }>
  | Readonly<{ status: 200 | 409; jobId: null; payload: Record<string, unknown> }>

/**
 * The owner's "go" in Work with me, for whatever this conversation's latest Builder job is waiting on: a verified project
 * to publish, or a held live-site repair PR to release to the governed merge. Null when nothing is waiting.
 */
export async function approvePausedWork(input: Readonly<{ userId: string; conversationId: string; language: string }>): Promise<PausedWorkApproval | null> {
  const held = awaitingRepositoryMerge(await readBuilderEvidenceJob({ userId: input.userId, conversationId: input.conversationId }))
  if (held) {
    if (String(process.env.BUILDER_AUTO_MERGE_ENABLED || '').trim().toLowerCase() !== 'true') return { status: 200, jobId: null, payload: {
      reply: assistanceCopy(COLLABORATE_MERGE_AUTOMERGE_OFF, input.language), source: 'cos-builder-merge-hold-kept',
      pull_request_number: held.pullRequestNumber, execution_allowed: false, external_action_taken: false,
    } }
    const released = await releaseRepositoryRepairMergeHold({ pullRequestNumber: held.pullRequestNumber })
    if (released === 'released') return { status: 200, jobId: null, payload: {
      reply: assistanceCopy(COLLABORATE_MERGE_RELEASED, input.language), source: 'cos-builder-merge-hold-released',
      pull_request_number: held.pullRequestNumber, execution_allowed: true, external_action_taken: true,
    } }
    return null
  }
  const outcome = await startApprovedIsolatedPublication({
    userId: input.userId, conversationId: input.conversationId, responseLanguage: input.language,
    runningReply: assistanceCopy(COLLABORATE_APPROVAL_STARTED, input.language),
    readLatestJob: readBuilderEvidenceJob,
    fingerprint: readBuilderWorkspaceFingerprint,
    enqueue: enqueueBuilderJob,
    jobExists: async (jobId, owner) => Boolean(await getBuilderJobForUser(jobId, owner)),
  })
  if (outcome.kind === 'none') return null
  if (outcome.kind === 'source_changed') return { status: 409, jobId: null, payload: {
    reply: assistanceCopy(COLLABORATE_SOURCE_CHANGED, input.language), source: 'cos-builder-approval-source-changed',
    execution_allowed: false, external_action_taken: false,
  } }
  return { status: 202, jobId: outcome.jobId, payload: {
    reply: assistanceCopy(COLLABORATE_APPROVAL_STARTED, input.language), source: 'cos-builder-approved-publication',
    jobId: outcome.jobId, workspaceId: outcome.workspaceId, status: 'queued',
    execution_allowed: true, external_action_taken: false,
  } }
}
