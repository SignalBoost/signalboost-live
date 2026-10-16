import type { SupabaseClient } from '@supabase/supabase-js'
import type { BuilderV2LeaseStore } from './agent-v2-job-cycle.ts'
import type { BuilderV2Checkpoint } from './agent-v2.ts'
import { MAX_WORK_SLICES } from './work-budget.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Database-backed V2 lease store. A row is eligible only when explicitly
 * tagged metadata.builderEngine=v2 and actively owned by the running claim.
 * This never opts legacy jobs into the new engine.
 */
export function createBuilderV2SupabaseLeaseStore(db: SupabaseClient, userId: string): BuilderV2LeaseStore {
  if (!UUID.test(userId)) throw new Error('builder_v2_invalid_user')
  return {
    async load(jobId) {
      if (!UUID.test(jobId)) return null
      const { data, error } = await db.from('builder_jobs')
        .select('workspace_id,objective,claim_generation,checkpoint,metadata,status')
        .eq('id', jobId).eq('user_id', userId).eq('status', 'running')
        .contains('metadata', { builderEngine: 'v2' }).maybeSingle()
      if (error) throw new Error(`builder_v2_job_load: ${error.message}`)
      if (!data) return null
      const checkpoint = data.checkpoint as BuilderV2Checkpoint | null
      if (checkpoint && checkpoint.version !== 2) throw new Error('builder_v2_checkpoint_version_mismatch')
      return {
        workspaceId: String(data.workspace_id),
        objective: String(data.objective),
        claimGeneration: Number(data.claim_generation),
        checkpoint,
      }
    },
    async save(jobId, claimGeneration, checkpoint) {
      if (!UUID.test(jobId) || !Number.isSafeInteger(claimGeneration) || claimGeneration < 1) return false
      if (checkpoint.version !== 2) return false
      const { data, error } = await db.from('builder_jobs')
        .update({ checkpoint, last_heartbeat_at: new Date().toISOString() })
        .eq('id', jobId).eq('user_id', userId)
        .eq('status', 'running').eq('claim_generation', claimGeneration)
        .contains('metadata', { builderEngine: 'v2' })
        .select('id')
      if (error) throw new Error(`builder_v2_job_save: ${error.message}`)
      return Array.isArray(data) && data.length === 1
    },
  }
}

/**
 * Pause a V2 slice with its checkpoint so the scheduler resumes it. Production 2026-10-16: V2 paused through
 * pause_builder_job_slice, which accepts only version-1 (V1) checkpoints, so every V2 pause raised and the job
 * failed with builder_v2_checkpoint_persist_failed. Same fences as that function: the running claim of this
 * generation, under the slice cap, a standard V2 job, and the checkpoint's own workspace.
 * Returns false when the claim is stale or the slice cap is reached.
 */
export async function pauseBuilderV2Job(db: SupabaseClient, input: Readonly<{
  jobId: string; userId: string; claimGeneration: number; checkpoint: BuilderV2Checkpoint
  reply: string; result: Record<string, unknown>
}>): Promise<boolean> {
  if (!UUID.test(input.jobId) || !UUID.test(input.userId) || input.checkpoint.version !== 2
    || !Number.isSafeInteger(input.claimGeneration) || input.claimGeneration < 1) return false
  const { data, error } = await db.from('builder_jobs')
    .update({ status: 'paused', checkpoint: input.checkpoint, result: input.result, updated_at: new Date().toISOString() })
    .eq('id', input.jobId).eq('user_id', input.userId)
    .eq('status', 'running').eq('claim_generation', input.claimGeneration).lt('claim_generation', MAX_WORK_SLICES)
    .eq('job_kind', 'standard').eq('workspace_id', input.checkpoint.workspaceId)
    .contains('metadata', { builderEngine: 'v2' })
    .select('id,history_message_id,conversation_id,workspace_id')
  if (error) throw new Error(`builder_v2_job_pause: ${error.message}`)
  const row = Array.isArray(data) && data.length === 1 ? data[0] as Record<string, unknown> : null
  if (!row) return false
  await db.from('assistant_messages').update({
    content: input.reply.slice(0, 16_000),
    provenance: { schema: 'signalboost-builder-job-v1', jobId: input.jobId, workspaceId: row.workspace_id, status: 'paused' },
  }).eq('id', row.history_message_id).eq('user_id', input.userId)
  await db.from('assistant_conversations').update({ updated_at: new Date().toISOString() })
    .eq('id', row.conversation_id).eq('user_id', input.userId)
  return true
}
