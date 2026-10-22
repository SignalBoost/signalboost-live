// saas/lib/builder/collaborate-approval-server.ts
//
// Work with me approval with the real stores. Shared by /api/builder (what chat calls, authenticated as the real user
// on every surface) and the COS Software Specialist, so both apply the same rules and the same replies.

import { assistanceCopy, COLLABORATE_APPROVAL_STARTED, COLLABORATE_SOURCE_CHANGED } from '../ai/cos/assistanceMode.ts'
import { startApprovedIsolatedPublication } from './collaborate-approval.ts'
import { enqueueBuilderJob, getBuilderJobForUser, readBuilderEvidenceJob, readBuilderWorkspaceFingerprint } from './job-store.ts'

export type PausedPublicationApproval =
  | Readonly<{ status: 202; jobId: string; payload: Record<string, unknown> }>
  | Readonly<{ status: 409; jobId: null; payload: Record<string, unknown> }>

/** Start publishing the conversation's paused Work with me job; null when nothing in it is waiting for approval. */
export async function approvePausedPublication(input: Readonly<{ userId: string; conversationId: string; language: string }>): Promise<PausedPublicationApproval | null> {
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
