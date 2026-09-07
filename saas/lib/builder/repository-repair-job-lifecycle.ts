import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseBuilderWorkspace } from './workspace-supabase.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SAFE_SHA = /^[0-9a-f]{40}$/i
const BUILDER_RESULT_TEXT_PATH = 'builder-result.txt'

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

function files(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

function historyReply(reply: string, workspaceId: string, paths: readonly string[]): string {
  const links = paths.slice(0, 20).map(path => {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/')
    const label = path.replace(/[\[\]]/g, '')
    return `- [Download ${label}](/api/builder/workspaces/${encodeURIComponent(workspaceId)}/files/${encodedPath})`
  })
  return links.length ? `${reply.trim()}\n\nBuilder files:\n${links.join('\n')}` : reply.trim()
}

async function persistResultArtifact(job: { userId: string; workspaceId: string }, reply: string): Promise<string[]> {
  const workspace = createSupabaseBuilderWorkspace(job.userId)
  if (!workspace) return []
  await workspace.writeFile(job.workspaceId, BUILDER_RESULT_TEXT_PATH, `${reply.trim()}\n`)
  return (await workspace.listFiles(job.workspaceId)).map(item => item.path)
}

/**
 * Reconcile the originating paused Builder job only after the durable merge worker has actually
 * merged its PR. The database finish gate creates this merge-pending state; ordinary Builder
 * continuation cannot claim it because Platform Engineer jobs have no BuilderLoopCheckpoint.
 *
 * The lookup is by server-persisted PR number rather than public PR text, so a forged PR cannot
 * nominate an arbitrary Builder job for completion.
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
