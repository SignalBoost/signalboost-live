import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type BuilderJobKind = 'standard' | 'debug_file'
export type BuilderJobStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export type BuilderJobRecord = Readonly<{
  id: string
  workspaceId: string
  userId: string
  conversationId: string
  objective: string
  jobKind: BuilderJobKind
  metadata: Record<string, unknown>
  ownerAuthorized: boolean
  status: BuilderJobStatus
  result: Record<string, unknown> | null
  error: string | null
  historyMessageId: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  updatedAt: string
}>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

function toJob(row: any): BuilderJobRecord {
  return Object.freeze({
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    userId: String(row.user_id),
    conversationId: String(row.conversation_id),
    objective: String(row.objective || ''),
    jobKind: String(row.job_kind || 'standard') as BuilderJobKind,
    metadata: Object.freeze(record(row.metadata)),
    ownerAuthorized: row.owner_authorized === true,
    status: String(row.status || 'queued') as BuilderJobStatus,
    result: row.result && typeof row.result === 'object' && !Array.isArray(row.result)
      ? Object.freeze(row.result as Record<string, unknown>)
      : null,
    error: typeof row.error === 'string' && row.error ? row.error : null,
    historyMessageId: typeof row.history_message_id === 'string' ? row.history_message_id : null,
    createdAt: String(row.created_at || ''),
    startedAt: typeof row.started_at === 'string' ? row.started_at : null,
    finishedAt: typeof row.finished_at === 'string' ? row.finished_at : null,
    updatedAt: String(row.updated_at || ''),
  })
}

export function builderJobStorageAvailable(): boolean {
  return serviceClient() !== null
}

export async function enqueueBuilderJob(input: {
  jobId: string
  workspaceId: string
  userId: string
  conversationId: string
  objective: string
  jobKind: BuilderJobKind
  metadata?: Record<string, unknown>
  ownerAuthorized?: boolean
  runningReply: string
}): Promise<Readonly<{ jobId: string; historyMessageId: string }>> {
  if (![input.jobId, input.workspaceId, input.userId, input.conversationId].every(value => UUID.test(value))) {
    throw new Error('builder_job_invalid_identity')
  }
  const db = serviceClient()
  if (!db) throw new Error('builder_job_storage_unavailable')
  const { data, error } = await db.rpc('enqueue_builder_job', {
    p_job_id: input.jobId,
    p_workspace_id: input.workspaceId,
    p_user_id: input.userId,
    p_conversation_id: input.conversationId,
    p_objective: String(input.objective || '').trim(),
    p_job_kind: input.jobKind,
    p_metadata: input.metadata || {},
    p_owner_authorized: input.ownerAuthorized === true,
    p_running_reply: String(input.runningReply || '').trim(),
  })
  if (error) throw new Error(`builder_job_enqueue: ${error.message}`)
  const row = Array.isArray(data) ? data[0] : data
  const jobId = String(row?.job_id || '')
  const historyMessageId = String(row?.history_message_id || '')
  if (!UUID.test(jobId) || !UUID.test(historyMessageId)) throw new Error('builder_job_enqueue_incomplete')
  return Object.freeze({ jobId, historyMessageId })
}

export async function claimBuilderJob(jobId: string, userId: string): Promise<BuilderJobRecord | null> {
  if (!UUID.test(jobId) || !UUID.test(userId)) return null
  const db = serviceClient()
  if (!db) throw new Error('builder_job_storage_unavailable')
  const { data, error } = await db.rpc('claim_builder_job', {
    p_job_id: jobId,
    p_user_id: userId,
  })
  if (error) throw new Error(`builder_job_claim: ${error.message}`)
  const row = Array.isArray(data) ? data[0] : data
  return row ? toJob(row) : null
}

export async function getBuilderJobForUser(jobId: string, userId: string): Promise<BuilderJobRecord | null> {
  if (!UUID.test(jobId) || !UUID.test(userId)) return null
  const db = serviceClient()
  if (!db) throw new Error('builder_job_storage_unavailable')
  const { data, error } = await db
    .from('builder_jobs')
    .select('id,workspace_id,user_id,conversation_id,objective,job_kind,metadata,owner_authorized,status,result,error,history_message_id,created_at,started_at,finished_at,updated_at')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`builder_job_read: ${error.message}`)
  return data ? toJob(data) : null
}

export async function finishBuilderJob(input: {
  jobId: string
  userId: string
  status: 'succeeded' | 'failed'
  reply: string
  result: Record<string, unknown>
  error?: string | null
}): Promise<void> {
  if (!UUID.test(input.jobId) || !UUID.test(input.userId)) throw new Error('builder_job_invalid_identity')
  const db = serviceClient()
  if (!db) throw new Error('builder_job_storage_unavailable')
  const { error } = await db.rpc('finish_builder_job', {
    p_job_id: input.jobId,
    p_user_id: input.userId,
    p_status: input.status,
    p_reply: String(input.reply || '').trim(),
    p_result: input.result || {},
    p_error: input.error || null,
  })
  if (error) throw new Error(`builder_job_finish: ${error.message}`)
}
