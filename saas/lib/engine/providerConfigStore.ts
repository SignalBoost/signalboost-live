// saas/lib/engine/providerConfigStore.ts
// Injected datastore seam for the integrations engine. The BYOK provider config — which provider
// a user runs and their encrypted API keys — is read/written through THIS port, never Supabase
// directly, so a Fortune-500 buyer stores it in their own database with one adapter. The store
// only ever holds ENCRYPTED key envelopes; userProviderConfigs.ts encrypts/decrypts around it.
import { createClient } from '@supabase/supabase-js'

export type UserProviderConfig = {
  user_id: string
  active_provider: string
  byok_enabled: boolean
  encrypted_keys: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

export interface ProviderConfigStore {
  getUserProviderConfig(userId: string): Promise<UserProviderConfig | null>
  upsertUserProviderConfig(record: {
    user_id: string
    active_provider: string
    byok_enabled: boolean
    encrypted_keys: Record<string, unknown>
  }): Promise<UserProviderConfig>
}

// ── SignalBoost's own adapter (the host implementation) ──
const COLS = 'user_id, active_provider, byok_enabled, encrypted_keys, created_at, updated_at'

function defaultSupabaseConfigStore(): ProviderConfigStore {
  function db() {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
  }
  return {
    async getUserProviderConfig(userId) {
      const { data, error } = await db()
        .from('user_provider_configs')
        .select(COLS)
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return (data as UserProviderConfig) || null
    },
    async upsertUserProviderConfig(record) {
      const { data, error } = await db()
        .from('user_provider_configs')
        .upsert({ ...record, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
        .select(COLS)
        .single()
      if (error) throw new Error(error.message)
      return data as UserProviderConfig
    },
  }
}

let active: ProviderConfigStore = defaultSupabaseConfigStore()

// A host installs its own datastore adapter once, at startup.
export function setProviderConfigStore(store: ProviderConfigStore): void {
  active = store || defaultSupabaseConfigStore()
}
export function getProviderConfigStore(): ProviderConfigStore {
  return active
}
