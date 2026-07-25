// saas/lib/agent-runtime/activity-store-supabase.ts

import { createClient } from '@supabase/supabase-js'
import type { AgentOperationActivityStore } from './activity-store.ts'

export function createSupabaseAgentOperationActivityStore(): AgentOperationActivityStore | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key) return null

  const client = createClient(url, key)
  return {
    async record(record) {
      const { error } = await client.from('agent_operation_activity').upsert({
        workflow_id: record.workflowId,
        request_id: record.requestId,
        provider_id: record.providerId ?? null,
        outcome: record.outcome,
        event_count: record.eventCount,
        duration_ms: record.durationMs,
      }, { onConflict: 'workflow_id,request_id' })
      if (error) throw new Error(`agent_operation_activity: ${error.message}`)
    },
  }
}
