import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { finishBuilderJob, type BuilderJobRecord } from './job-store.ts'
import { createSupabaseBuilderWorkspace } from './workspace-supabase.ts'
import { formatBuilderOperatorRepairReply } from './operator-narration.ts'
import { isRepairObjective } from './regression-gate.ts'
import type { SignalBoostRepositoryRepairExecution } from './repository-repair.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SAFE_SHA = /^[0-9a-f]{40}$/i
const BUILDER_RESULT_TEXT_PATH = 'builder-result.txt'

type PublicTraceEntry = Readonly<Record<string, unknown>>

function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function trace(value: unknown): PublicTraceEntry[] {
  return Array.isArray(value)
    ? value.filter(item => item && typeof item === 'object' && !Array.isArray(item)) as PublicTraceEntry[]
    : []
}

function files(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

function pullRequestNumber(payload: Record<string, unknown>): number | null {
  const value = Number(payload.pull_request_number)
  return Number.isInteger(value) && value > 0 ? value : null
}

function historyReply(reply: string, workspaceId: string, paths: readonly string[]): string {
  const links = paths.slice(0, 20).map(path => {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/')
    const label = path.replace(/[\[\]]/g, '')
    return `- [Download ${label}](/api/builder/workspaces/${encodeURIComponent(workspaceId)}/files/${encodedPath})`
  })
  return links.length ? `${reply.trim()}\n\nBuilder files:\n${links.join('\n')}` : reply.trim()
}

async function persistResultArtifact(job: Pick<BuilderJobRecord, 'userId' | 'workspaceId'>, reply: string): Promise<string[]> {
  const workspace = createSupabaseBuilderWorkspace(job.userId)
  if (!workspace) return []
  await workspace.writeFile(job.workspaceId, BUILDER_RESULT_TEXT_PATH, `${reply.trim()}\n`)
  return (await workspace.listFiles(job.workspaceId)).map(item => item.path)
}

async function pauseRepositoryRepairJob(input: {
  job: BuilderJobRecord
  pullRequestNumber: number
  reply: string
  result: Record<string, unknown>
}): Promise<void> {
  const db = serviceClient()
  if (!db) throw new Error('builder_job_storage_unavailable')
  if (input.job.metadata.platformRepair !== true || !input.job.ownerAuthorized) {
    throw new Error('builder_repository_merge_pause_not_authorized')
  }

  const updatedAt = new Date().toISOString()
  const { data, error } = await db.from('builder_jobs').update({
    status: 'paused',
    // Platform Engineer merge waiting is deliberately not a BuilderLoopCheckpoint. Keeping this
    // null prevents the ordinary continuation worker from replaying repository repair execution.
    checkpoint: null,
    result: input.result,
    error: null,
    updated_at: updatedAt,
  })
    .eq('id', input.job.id)
    .eq('user_id', input.job.userId)
    .eq('status', 'running')
    .eq('claim_generation', input.job.claimGeneration)
    .select('history_message_id,conversation_id,workspace_id')
    .maybeSingle()

  if (error || !data) throw new Error('builder_repository_merge_pause_failed')
  const { error: messageError } = await db.from('assistant_messages').update({
    content: input.reply.slice(0, 16_000),
    provenance: {
      schema: 'signalboost-builder-job-v1',
      jobId: input.job.id,
      workspaceId: input.job.workspaceId,
      status: 'paused',
      repositoryMergePending: true,
      pullRequestNumber: input.pullRequestNumber,
    },
  }).eq('id', data.history_message_id).eq('user_id', input.job.userId)
  if (messageError) throw new Error('builder_repository_merge_pause_message_failed')
  await db.from('assistant_conversations').update({ updated_at: updatedAt })
    .eq('id', data.conversation_id).eq('user_id', input.job.userId)
}

/**
 * A Platform Engineer repository repair is not complete merely because its sandbox edit passed.
 * Success requires a real PR merge. If the PR exists but CI/merge is still pending, keep the job
 * paused and durable; the merge cron is the only component allowed to promote it to succeeded.
 */
export async function settleBuilderRepositoryRepairExecution(
  job: BuilderJobRecord,
  execution: SignalBoostRepositoryRepairExecution,
): Promise<void> {
  const payload = execution.payload
  const reportedError = typeof payload.error === 'string' && payload.error.trim() ? payload.error.trim() : null
  const prNumber = pullRequestNumber(payload)
  const mergeTaken = payload.merge_taken === true
  const mergeCommitSha = typeof payload.merge_commit_sha === 'string' && SAFE_SHA.test(payload.merge_commit_sha)
    ? payload.merge_commit_sha
    : null
  const prCreated = payload.repository_write_stage === 'pr_created' && prNumber !== null
  const mergePending = execution.status >= 200 && execution.status < 300 && !reportedError
    && prCreated && payload.merge_allowed === true && !mergeTaken
  const succeeded = execution.status >= 200 && execution.status < 300 && !reportedError
    && prCreated && mergeTaken && mergeCommitSha !== null
  const safeTrace = trace(payload.trace)
  const baseReply = typeof payload.reply === 'string' && payload.reply.trim()
    ? payload.reply.trim()
    : 'Builder completed repository execution without a repository outcome message.'

  let plainReply: string
  let terminalError: string | null = null
  if (succeeded) {
    const proof = isRepairObjective(job.objective)
      ? formatBuilderOperatorRepairReply({ ok: true, answer: baseReply, trace: safeTrace as any })
      : baseReply
    plainReply = `${proof}\n\nRepository outcome: PR #${prNumber} was committed and merged to main as ${mergeCommitSha}.`
  } else if (mergePending) {
    plainReply = `Builder verified the repository repair and created PR #${prNumber}, but the job is not complete yet. GitHub CI/merge is still pending. Builder will mark this job succeeded only after that PR is actually merged.\n\n${baseReply}`
  } else {
    terminalError = reportedError || 'builder_repository_merge_incomplete'
    const proof = isRepairObjective(job.objective)
      ? formatBuilderOperatorRepairReply({ ok: false, error: terminalError, trace: safeTrace as any })
      : `Builder could not complete the repository repair: ${terminalError}`
    plainReply = `${proof}\n\nRepository outcome: ${baseReply}`
  }

  let artifactFiles = files(payload.files)
  try {
    artifactFiles = await persistResultArtifact(job, plainReply)
  } catch (error) {
    console.error('[builder_repository_result_artifact_write_failed]', {
      jobId: job.id,
      message: error instanceof Error ? error.message : 'unknown',
    })
  }
  const reply = historyReply(plainReply, job.workspaceId, artifactFiles)
  const result = {
    ...payload,
    jobId: job.id,
    workspaceId: job.workspaceId,
    status: mergePending ? 'paused' : succeeded ? 'succeeded' : 'failed',
    repository_merge_pending: mergePending,
    reply,
    files: artifactFiles,
  }

  if (mergePending && prNumber) {
    await pauseRepositoryRepairJob({ job, pullRequestNumber: prNumber, reply, result })
    return
  }

  await finishBuilderJob({
    jobId: job.id,
    userId: job.userId,
    claimGeneration: job.claimGeneration,
    status: succeeded ? 'succeeded' : 'failed',
    reply,
    result,
    ...(terminalError ? { error: terminalError } : {}),
  })
}

/**
 * Reconcile the originating paused Builder job after the durable merge worker has actually merged
 * its PR. The lookup is by server-persisted PR number rather than public PR text, so a forged PR
 * cannot nominate an arbitrary Builder job for completion.
 */
export async function completeBuilderRepositoryRepairAfterMerge(input: {
  pullRequestNumber: number
  mergeCommitSha: string
  detail?: string | null
}): Promise<boolean> {
  if (!Number.isInteger(input.pullRequestNumber) || input.pullRequestNumber < 1 || !SAFE_SHA.test(input.mergeCommitSha)) return false
  const db = serviceClient()
  if (!db) throw new Error('builder_job_storage_unavailable')

  const { data: row, error: readError } = await db.from('builder_jobs')
    .select('id,user_id,workspace_id,conversation_id,history_message_id,claim_generation,metadata,result')
    .eq('status', 'paused')
    .contains('metadata', { platformRepair: true })
    .contains('result', { pull_request_number: input.pullRequestNumber, repository_merge_pending: true })
    .order('updated_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (readError) throw new Error('builder_repository_merge_job_read_failed')
  if (!row || !UUID.test(String(row.id)) || !UUID.test(String(row.user_id)) || !UUID.test(String(row.workspace_id))) return false

  const plainReply = `Builder completed the repository repair. PR #${input.pullRequestNumber} passed the governed merge gates and was merged to main as ${input.mergeCommitSha}.${input.detail ? ` ${String(input.detail).trim()}` : ''}`
  let artifactFiles = files(record(row.result).files)
  try {
    artifactFiles = await persistResultArtifact({ userId: String(row.user_id), workspaceId: String(row.workspace_id) }, plainReply)
  } catch (error) {
    console.error('[builder_repository_merge_result_artifact_write_failed]', {
      jobId: row.id,
      message: error instanceof Error ? error.message : 'unknown',
    })
  }
  const reply = historyReply(plainReply, String(row.workspace_id), artifactFiles)
  const previous = record(row.result)
  const terminalResult = {
    ...previous,
    status: 'succeeded',
    repository_merge_pending: false,
    merge_taken: true,
    merge_commit_sha: input.mergeCommitSha,
    reply,
    files: artifactFiles,
  }
  const updatedAt = new Date().toISOString()
  const { data: updated, error: updateError } = await db.from('builder_jobs').update({
    status: 'succeeded',
    checkpoint: null,
    result: terminalResult,
    error: null,
    finished_at: updatedAt,
    updated_at: updatedAt,
  })
    .eq('id', row.id)
    .eq('status', 'paused')
    .eq('claim_generation', row.claim_generation)
    .select('id')
    .maybeSingle()
  if (updateError) throw new Error('builder_repository_merge_job_finish_failed')
  if (!updated) return false

  const { error: messageError } = await db.from('assistant_messages').update({
    content: reply.slice(0, 16_000),
    provenance: {
      schema: 'signalboost-builder-job-v1',
      jobId: row.id,
      workspaceId: row.workspace_id,
      status: 'succeeded',
      repositoryMergePending: false,
      pullRequestNumber: input.pullRequestNumber,
      mergeCommitSha: input.mergeCommitSha,
    },
  }).eq('id', row.history_message_id).eq('user_id', row.user_id)
  if (messageError) throw new Error('builder_repository_merge_job_message_failed')
  await db.from('assistant_conversations').update({ updated_at: updatedAt })
    .eq('id', row.conversation_id).eq('user_id', row.user_id)
  return true
}
