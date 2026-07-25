import { createClient } from '@supabase/supabase-js'
import type { PortableBrowserActivityPort } from './browser-activity-port.ts'

export function createSupabasePortableBrowserActivityPort(): PortableBrowserActivityPort | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key) return null

  const client = createClient(url, key)
  return {
    async record(event) {
      const { error } = await client.from('portable_browser_activity').insert({
        runtime_id: event.runtimeId,
        event_type: event.eventType,
        provider_id: event.providerId ?? null,
        adapter_id: event.adapterId ?? null,
        outcome: event.outcome ?? null,
      })
      if (error) throw new Error(`portable_browser_activity: ${error.message}`)
    },
  }
}
