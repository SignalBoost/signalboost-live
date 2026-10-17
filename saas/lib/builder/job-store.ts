import type { BuilderLoopCheckpoint } from './checkpoint.ts'
import { MAX_WORK_SLICES } from './work-budget.ts'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { EvidenceLookup } from './execution-evidence.ts'
import { proposalObjective, workspaceFingerprint, type BuilderProposal } from './proposal.ts'

export type BuilderJobKind = 'standard' | 'debug_file'
export type BuilderJobStatus = 'queued' | 'running' | 'paused' | 'succeeded' | 'failed'

export type BuilderJobRecord = Readonly<{
  id: string
  workspaceId: string
  userId: string
  conversationId: string
  objective: string
  jobKind: BuilderJobKind
  metadata: Record<string, unknown>
  ownerAuthorized: boolean
  claimGeneration: number
  checkpoint: BuilderLoopCheckpoint | null
  status: BuilderJobStatus
  result: Record<string, unknown> | null
  error: string | null
  historyMessageId: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  updatedAt: string
}>

export const BUILDER_JOB_STALE_AFTER_MS = 6 * 60 * 1000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const JOB_SELECT = 'id,workspace_id,user_id,conversation_id,objective,job_kind,metadata,owner_authorized,status,result,error,history_message_id,created_at,started_at,finished_at,updated_at,claim_generation,checkpoint'

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
    claimGeneration: Number(row.claim_generation || 0),
    checkpoint: row.checkpoint || null,
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

async function readBuilderJob(
  db: SupabaseClient,
  jobId: string,
  userId: string,
): Promise<BuilderJobRecord | null> {
  const { data, error } = await db
    .from('builder_jobs')
    .select(JOB_SELECT)
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`builder_job_read: ${error.message}`)
  return data ? toJob(data) : null
}

function stale(job: BuilderJobRecord): boolean {
  if (job.status !== 'queued' && job.status !== 'running') return false
  const updatedAtMs = Date.parse(job.updatedAt)
  return Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs >= BUILDER_JOB_STALE_AFTER_MS
}

export function builderJobStorageAvailable(): boolean {
  return serviceClient() !== null
}

export async function readBuilderEvidenceJob(input: EvidenceLookup): Promise<BuilderJobRecord | null> {
  if (![input.userId, input.conversationId].every(value => UUID.test(value))) return null
  if (input.jobId && !UUID.test(input.jobId)) return null
  if (input.workspaceId && !UUID.test(input.workspaceId)) return null
  const db = serviceClient()
  if (!db) return null
  let query = db.from('builder_jobs').select(JOB_SELECT)
    .eq('user_id', input.userId).eq('conversation_id', input.conversationId)
  if (input.jobId) query = query.eq('id', input.jobId)
  if (input.workspaceId) query = query.eq('workspace_id', input.workspaceId)
  const { data, error } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw new Error('builder_evidence_read_failed')
  return data ? toJob(data) : null
}

/** Most recent job for an explicitly selected workspace, scoped to its owner.
 * A saved workspace can be reopened in a new browser conversation without
 * forgetting a still-running job. Never select across tenants.
 */
export async function readLatestBuilderWorkspaceJob(input: {
  userId: string; workspaceId: string
}): Promise<BuilderJobRecord | null> {
  if (!UUID.test(input.userId) || !UUID.test(input.workspaceId)) return null
  const db = serviceClient()
  if (!db) throw new Error('builder_job_storage_unavailable')
  const { data, error } = await db.from('builder_jobs').select(JOB_SELECT)
    .eq('user_id', input.userId).eq('workspace_id', input.workspaceId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw new Error('builder_workspace_job_read_failed')
  return data ? toJob(data) : null
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
  const { data, error } = await db.rpc('claim_builder_job_slice', {
    p_job_id: jobId,
    p_user_id: userId,
  })
  if (error) throw new Error(`builder_job_claim: ${error.message}`)
  const row = Array.isArray(data) ? data[0] : data
  return row ? toJob(row) : null
}

export async function deferBuilderJobForCapacity(input: {
  job: BuilderJobRecord
  reason: 'builder_runpod_primary_busy' | 'builder_turn_timeout' | 'builder_model_round_timeout'
  // The progress of the slice that hit capacity. Null clears an older checkpoint: files written after it would make the
  // resumed job fail with builder_checkpoint_workspace_changed.
  checkpoint?: BuilderLoopCheckpoint | null
}): Promise<boolean> {
  const db = serviceClient()
  if (!db) throw new Error('builder_job_storage_unavailable')
  // Store this slice's progress first, fenced to this exact running claim, then re-queue through the existing
  // deferral function. No database migration is needed: Production 2026-10-14 still ran the four-argument function,
  // so a checkpoint argument made every capacity re-queue fail. If the re-queue is refused, the caller pauses or
  // finishes the job and overwrites the checkpoint itself.
  const { data: stored, error: storeError } = await db.from('builder_jobs')
    .update({ checkpoint: input.checkpoint ?? null })
    .eq('id', input.job.id).eq('user_id', input.job.userId)
    .eq('status', 'running').eq('claim_generation', input.job.claimGeneration)
    .select('id')
  if (storeError) throw new Error(`builder_job_capacity_checkpoint: ${storeError.message}`)
  if (!Array.isArray(stored) || stored.length !== 1) return false
  const { data, error } = await db.rpc('defer_builder_job_capacity', {
    p_job_id: input.job.id,
    p_user_id: input.job.userId,
    p_generation: input.job.claimGeneration,
    p_reason: input.reason,
  })
  if (error) throw new Error(`builder_job_capacity_defer: ${error.message}`)
  return data === true
}

export async function reconcileStaleBuilderJobs(input: {
  userId: string
  jobId?: string | null
  conversationId?: string | null
}): Promise<number> {
  if (!UUID.test(input.userId)) throw new Error('builder_job_invalid_identity')
  if (input.jobId && !UUID.test(input.jobId)) throw new Error('builder_job_invalid_identity')
  if (input.conversationId && !UUID.test(input.conversationId)) throw new Error('builder_job_invalid_identity')
  const db = serviceClient()
  if (!db) throw new Error('builder_job_storage_unavailable')
  const { data, error } = await db.rpc('expire_stale_builder_jobs', {
    p_user_id: input.userId,
    p_cutoff: new Date(Date.now() - BUILDER_JOB_STALE_AFTER_MS).toISOString(),
    p_job_id: input.jobId || null,
    p_conversation_id: input.conversationId || null,
  })
  if (error) throw new Error(`builder_job_stale_recovery: ${error.message}`)
  const count = Number(data ?? 0)
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
}

export async function getBuilderJobForUser(jobId: string, userId: string): Promise<BuilderJobRecord | null> {
  if (!UUID.test(jobId) || !UUID.test(userId)) return null
  const db = serviceClient()
  if (!db) throw new Error('builder_job_storage_unavailable')
  const job = await readBuilderJob(db, jobId, userId)
  // Queued jobs have not acquired an execution lease. Never classify an
  // unclaimed queue wait as a lost worker merely because six minutes elapsed.
  if (!job || job.status === 'queued' || !stale(job)) return job

  try {
    await reconcileStaleBuilderJobs({ userId, jobId })
    return await readBuilderJob(db, jobId, userId)
  } catch (error) {
    console.error('[builder_job_stale_recovery_failed]', {
      jobId,
      message: error instanceof Error ? error.message : 'unknown',
    })
    return job
  }
}

export async function finishBuilderJob(input: {
  jobId: string
  userId: string
  claimGeneration: number
  status: 'succeeded' | 'failed'
  reply: string
  result: Record<string, unknown>
  error?: string | null
}): Promise<void> {
  if (!UUID.test(input.jobId) || !UUID.test(input.userId)) throw new Error('builder_job_invalid_identity')
  const db = serviceClient()
  if (!db) throw new Error('builder_job_storage_unavailable')
  const { error } = await db.rpc('finish_builder_job_slice', {
    p_job_id: input.jobId,
    p_user_id: input.userId,
    p_generation: input.claimGeneration,
    p_status: input.status,
    p_reply: String(input.reply || '').trim(),
    p_result: input.result || {},
    p_error: input.error || null,
  })
  if (error) throw new Error(`builder_job_finish: ${error.message}`)
  // Best-effort terminal telemetry. Status is owned by the generation-fenced RPC above.
  const { error: telemetryError } = await db.from('builder_jobs').update({
    last_finished_at: new Date().toISOString(),
    last_error: input.error || null,
  }).eq('id', input.jobId).eq('user_id', input.userId)
    .eq('claim_generation', input.claimGeneration).eq('status', input.status)
  if (telemetryError) console.warn('[builder_job_terminal_telemetry_failed]', {
    jobId: input.jobId, code: telemetryError.code,
  })
}

/** Only server-owned paused checkpoints are eligible; running/uncertain work is never replayed. */
/**
 * Work a person is waiting for goes before background Self-Healing work. Production 2026-10-14 (OrderFlow job
 * 57f9bd7b): with eight Self-Healing repairs queued and one in the capacity queue, the owner's build sat idle 319s
 * while the one-job-per-tick scheduler took jobs in age order. Every Self-Healing job carries selfHealing* metadata.
 */
export function builderPersonStarted(metadata: unknown): boolean {
  return !Object.keys(metadata && typeof metadata === 'object' ? metadata : {}).some(key => key.startsWith('selfHealing'))
}

export function personStartedFirst<T extends { metadata?: unknown }>(rows: readonly T[]): T[] {
  return [...rows.filter(row => builderPersonStarted(row.metadata)), ...rows.filter(row => !builderPersonStarted(row.metadata))]
}

export async function listBuilderContinuations(): Promise<Array<{ id: string; userId: string }>> {
  const db = serviceClient()
  if (!db) throw new Error('builder_job_storage_unavailable')
  const { data, error } = await db.from('builder_jobs').select('id,user_id,metadata')
    .eq('status', 'paused').eq('job_kind', 'standard').not('checkpoint', 'is', null)
    .lt('claim_generation', MAX_WORK_SLICES).order('updated_at', { ascending: true }).limit(30)
  if (error) throw new Error('builder_continuations_read_failed')
  return personStartedFirst(data || []).slice(0, 3).map(row => ({ id: row.id, userId: row.user_id }))
}

/**
 * The same paused checkpoint the scheduler would pick next. Production 2026-10-14 (OrderFlow job 4eb4a2e5): a paused
 * job sat idle 112-148s between slices waiting for the once-a-minute scheduler while its owner's page polled every 2s.
 */
export function builderPollMayResume(job: Pick<BuilderJobRecord, 'status' | 'jobKind' | 'checkpoint' | 'claimGeneration'>): boolean {
  return job.status === 'paused' && job.jobKind === 'standard' && job.checkpoint !== null && job.claimGeneration < MAX_WORK_SLICES
}

/**
 * Admission for a poll resume: no Builder claim is running and no other paused checkpoint is waiting. Two polls can then
 * only ever target the same job, and the generation-fenced claim starts it once, so polls never add a second job to the
 * single model slot (Codex review of #4392). Otherwise the scheduler decides. Unknown counts fail closed.
 */
export async function builderSoleResumableJob(jobId: string): Promise<boolean> {
  const db = serviceClient()
  if (!db) return false
  const { count, error } = await db.from('builder_jobs').select('id', { count: 'exact', head: true })
    .or('status.eq.running,and(status.eq.paused,job_kind.eq.standard,checkpoint.not.is.null)').neq('id', jobId)
  return !error && count === 0
}

/** A bounded new claim cycle on the same durable job; never recreates workspace files. */
export async function requeueBuilderContinuationCycle(input: {
  job: BuilderJobRecord; checkpoint: BuilderLoopCheckpoint; reply: string; result: Record<string, unknown>
}): Promise<boolean> {
  const db = serviceClient()
  if (!db) throw new Error('builder_job_storage_unavailable')
  const { data, error } = await db.rpc('requeue_builder_continuation_cycle', {
    p_job_id: input.job.id, p_user_id: input.job.userId, p_generation: input.job.claimGeneration,
    p_checkpoint: input.checkpoint, p_reply: input.reply, p_result: input.result,
  })
  if (error) throw new Error(`builder_continuation_requeue_failed: ${error.message}`)
  return data === true
}

export async function pauseBuilderJob(input: {
  job: BuilderJobRecord; checkpoint: BuilderLoopCheckpoint; reply: string; result: Record<string, unknown>
}): Promise<void> {
  const db = serviceClient()
  if (!db) throw new Error('builder_job_storage_unavailable')
  const { data, error } = await db.rpc('pause_builder_job_slice', {
    p_job_id: input.job.id, p_user_id: input.job.userId, p_generation: input.job.claimGeneration,
    p_checkpoint: input.checkpoint, p_reply: input.reply, p_result: input.result,
  })
  if (error || data !== true) throw new Error('builder_checkpoint_persist_failed')
}

/** Read all scoped file identities for a proposal; never creates or changes a workspace. */
export async function readBuilderWorkspaceFingerprint(userId: string, workspaceId: string): Promise<string> {
  if (![userId, workspaceId].every(value => UUID.test(value))) throw new Error('builder_proposal_scope')
  const db = serviceClient()
  if (!db) throw new Error('builder_job_storage_unavailable')
  const { data, error } = await db.from('builder_workspace_files').select('path,content')
    .eq('user_id', userId).eq('workspace_id', workspaceId).order('path').limit(101)
  if (error || !data?.length || data.length > 100) throw new Error('builder_proposal_source_unavailable')
  return workspaceFingerprint(data.map(row => ({ path: String(row.path), content: String(row.content) })))
}

export async function saveBuilderProposal(input: {
  userId: string; conversationId: string; sourceJobId: string; fingerprint: string; objective: string
}): Promise<BuilderProposal> {
  const objective = proposalObjective(input.objective)
  const job = await readBuilderEvidenceJob(input)
  if (!objective || !job || job.id !== input.sourceJobId || job.status !== 'succeeded' || job.metadata.platformRepair === true)
    throw new Error('builder_proposal_unavailable')
  if (await readBuilderWorkspaceFingerprint(job.userId, job.workspaceId) !== input.fingerprint) throw new Error('builder_proposal_source_changed')
  const proposal: BuilderProposal = { id: crypto.randomUUID(), sourceJobId: job.id, objective,
    fingerprint: input.fingerprint, expiresAt: Date.now() + 60 * 60 * 1000 }
  const db = serviceClient()
  if (!db) throw new Error('builder_job_storage_unavailable')
  const { data, error } = await db.from('builder_jobs').update({ metadata: { ...job.metadata, pendingProposal: proposal } })
    .eq('id', job.id).eq('user_id', job.userId).eq('conversation_id', job.conversationId)
    .eq('status', 'succeeded').eq('metadata', JSON.stringify(job.metadata)).select('id').maybeSingle()
  if (error || !data) throw new Error('builder_proposal_save_failed')
  return proposal
}

/** Owner-requested cancellation: fence off the running worker and retain all workspace files/checkpoint. */
export async function stopBuilderJobForUser(jobId: string, userId: string): Promise<'stopped' | 'already_finished' | 'not_found'> {
  if (!UUID.test(jobId) || !UUID.test(userId)) throw new Error('builder_job_invalid_identity')
  const db = serviceClient()
  if (!db) throw new Error('builder_job_storage_unavailable')
  const { data, error } = await db.from('builder_jobs').select('id,status,claim_generation').eq('id', jobId).eq('user_id',userId).maybeSingle()
  if (error) throw new Error('builder_job_cancel_read_failed')
  if (!data) return 'not_found'
  if (!['queued','paused','running'].includes(data.status)) return 'already_finished'
  const now = new Date().toISOString()
  const { data: stopped, error: updateError } = await db.from('builder_jobs').update({status:'failed',error:'builder_cancelled_by_owner',last_error:'builder_cancelled_by_owner',claim_generation:data.claim_generation+1,finished_at:now,last_finished_at:now,updated_at:now})
    .eq('id',jobId).eq('user_id',userId).eq('claim_generation',data.claim_generation).in('status',['queued','paused','running']).select('id').maybeSingle()
  if(updateError) throw new Error('builder_job_cancel_write_failed')
  return stopped ? 'stopped' : 'already_finished'
}
