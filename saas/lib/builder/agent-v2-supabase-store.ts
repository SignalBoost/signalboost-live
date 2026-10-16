import type { SupabaseClient } from '@supabase/supabase-js'
import type { BuilderV2LeaseStore } from './agent-v2-job-cycle.ts'
import type { BuilderV2Checkpoint } from './agent-v2.ts'

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
