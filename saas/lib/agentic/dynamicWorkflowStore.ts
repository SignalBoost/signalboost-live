import type { SupabaseClient } from '@supabase/supabase-js'
import { validateDynamicWorkflowDefinition, type DynamicWorkflowDefinition } from './dynamicWorkflowDefinition.ts'
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Persist immutable definitions only after validation against server-owned capability IDs.
 * This store never runs workflows and never grants new tool permissions.
 * Use a server-side service-role client; never expose that client to browsers.
 */
export function createDynamicWorkflowDefinitionStore(
  db: SupabaseClient,
  userId: string,
  capabilities: ReadonlySet<string>,
) {
  if (!UUID.test(userId)) throw new Error('workflow_invalid_owner')
  return {
    async latest(workflowId: string): Promise<{revision:number;definition:DynamicWorkflowDefinition}|null> {
      if (!/^[a-z][a-z0-9_-]{0,63}$/.test(workflowId)) throw new Error('workflow_invalid_id')
      const {data,error}=await db.from('agentic_workflow_definitions')
        .select('revision,definition').eq('user_id',userId).eq('workflow_id',workflowId)
        .order('revision',{ascending:false}).limit(1).maybeSingle()
      if(error) throw new Error('workflow_load_failed')
      if(!data)return null
      return {revision:Number(data.revision),definition:validateDynamicWorkflowDefinition(data.definition,capabilities)}
    },
    async register(input:unknown, expectedPreviousRevision:number):Promise<{revision:number;definition:DynamicWorkflowDefinition}> {
      const definition=validateDynamicWorkflowDefinition(input,capabilities)
      if(!Number.isSafeInteger(expectedPreviousRevision)||expectedPreviousRevision<0)throw new Error('workflow_invalid_revision')
      const existing=await this.latest(definition.id)
      if((existing?.revision??0)!==expectedPreviousRevision)throw new Error('workflow_revision_conflict')
      const revision=expectedPreviousRevision+1
      const {error}=await db.from('agentic_workflow_definitions').insert({
        user_id:userId,workflow_id:definition.id,revision,definition,
      })
      if(error)throw new Error(error.code==='23505'?'workflow_revision_conflict':'workflow_save_failed')
      return {revision,definition}
    },
  }
}
