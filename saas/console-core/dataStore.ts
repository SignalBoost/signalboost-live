// saas/console-core/dataStore.ts
// Injected data seam for console executors that read host records (e.g. email delivery status).
// Executors call getDataStore().<method>() instead of touching Supabase directly, so a
// Fortune-500 host points these at THEIR database with one adapter. The default adapter uses
// SignalBoost's Supabase (credentials resolved through the secrets seam), so the platform is
// unchanged. Enrichment is best-effort: an adapter may return {} and the console still works.
import { createClient } from '@supabase/supabase-js'
import { getSecret } from './secrets'

export interface ConsoleDataStore {
  // Given Resend email ids, return delivery-status rows keyed by resend_email_id.
  getEmailDeliveryStatus(ids: string[]): Promise<Record<string, any>>
}

function defaultSupabaseDataStore(): ConsoleDataStore {
  return {
    async getEmailDeliveryStatus(ids) {
      const url = getSecret('NEXT_PUBLIC_SUPABASE_URL')
      const svc = getSecret('SUPABASE_SERVICE_ROLE_KEY')
      if (!url || !svc || !ids.length) return {}
      const db = createClient(url, svc, { auth: { persistSession: false, autoRefreshToken: false } })
      const out: Record<string, any> = {}
      for (let i = 0; i < ids.length; i += 100) {
        const { data } = await db.from('email_delivery_status').select('*').in('resend_email_id', ids.slice(i, i + 100))
        for (const r of (data || [])) out[(r as any).resend_email_id] = r
      }
      return out
    },
  }
}

let active: ConsoleDataStore = defaultSupabaseDataStore()

// A host installs its own data adapter once, at startup (createHost() does this for it).
export function setConsoleDataStore(store: ConsoleDataStore): void {
  active = store || defaultSupabaseDataStore()
}
export function getDataStore(): ConsoleDataStore {
  return active
}
