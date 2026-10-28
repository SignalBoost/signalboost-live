import type { SupabaseClient } from '@supabase/supabase-js'
import type { DynamicWorkflowRun } from './dynamicWorkflowRun.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_STATE_BYTES = 65536

/** Server-only, owner-scoped optimistic concurrency store. A successful write
 * advances generation by exactly one and requires the prior generation to match.
 * No read/modify/write may execute capabilities before the claim is persisted.
 */
export function createDynamicWorkflowRunCheckpointStore(db: SupabaseClient, userId: string) {
  if (!UUID.test(userId)) throw new Error('workflow_checkpoint_invalid_owner')
  return {
    async load(runId: string): Promise<{generation:number;state:DynamicWorkflowRun}|null> {
      if (!UUID.test(runId)) throw new Error('workflow_checkpoint_invalid_run')
      const {data,error}=await db.from('agentic_workflow_runs')
        .select('generation,state').eq('id',runId).eq('user_id',userId).maybeSingle()
      if(error) throw new Error('workflow_checkpoint_load_failed')
      if(!data)return null
      return {generation:Number(data.generation),state:data.state as DynamicWorkflowRun}
    },
    async save(runId:string, expectedGeneration:number, state:DynamicWorkflowRun):Promise<number> {
      if (!UUID.test(runId)) throw new Error('workflow_checkpoint_invalid_run')
      if(!Number.isSafeInteger(expectedGeneration)||expectedGeneration<0)throw new Error('workflow_checkpoint_invalid_generation')
      const serialized=JSON.stringify(state)
      if(Buffer.byteLength(serialized,'utf8')>MAX_STATE_BYTES)throw new Error('workflow_checkpoint_state_too_large')
      const {data,error}=await db.from('agentic_workflow_runs')
        .update({state,generation:expectedGeneration+1,updated_at:new Date().toISOString()})
        .eq('id',runId).eq('user_id',userId)
        .eq('workflow_id',state.workflowId).eq('definition_revision',state.definitionRevision)
        .eq('generation',expectedGeneration).select('id')
      if(error)throw new Error('workflow_checkpoint_save_failed')
      if(!Array.isArray(data)||data.length!==1)throw new Error('workflow_checkpoint_conflict')
      return expectedGeneration+1
    },
  }
}
