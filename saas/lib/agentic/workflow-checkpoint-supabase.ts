import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { WorkflowCheckpointStore, VersionedWorkflowCheckpoint } from './taskLifecycle'

/**
 * Server-only PostgreSQL CAS adapter. The RPC performs the revision comparison
 * and write atomically; never emulate CAS with a client-side SELECT + UPDATE.
 * Requires the separately-reviewed agentic_workflow_checkpoint schema/RPC.
 */
export function createSupabaseWorkflowCheckpointStore(): WorkflowCheckpointStore {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key=process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if(!url || !key) throw new Error('workflow_checkpoint_storage_not_configured')
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
  return {
    async read(runId){
      const {data,error}=await client.from('agentic_workflow_checkpoint').select('revision,state').eq('run_id',runId).maybeSingle()
      if(error) throw new Error('workflow_checkpoint_read_failed')
      if(!data) return null
      if(!Number.isSafeInteger(data.revision) || !data.state || typeof data.state!=='object') throw new Error('invalid_checkpoint_storage_row')
      return {revision:data.revision,state:data.state} as VersionedWorkflowCheckpoint
    },
    async compareAndSwap(runId,expectedRevision,next){
      const {data,error}=await client.rpc('agentic_workflow_checkpoint_cas',{
        p_run_id:runId,p_expected_revision:expectedRevision,p_next_revision:next.revision,p_state:next.state,
      })
      if(error) throw new Error('workflow_checkpoint_cas_failed')
      if(typeof data!=='boolean') throw new Error('workflow_checkpoint_cas_invalid_result')
      return data
    },
  }
}
