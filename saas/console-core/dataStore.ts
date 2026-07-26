// saas/console-core/dataStore.ts
// Injected data seam for console executors that read/write host records. Executors call
// getDataStore().<method>() instead of touching Supabase directly, so a Fortune-500 host points
// these at THEIR database with one adapter. The default adapter uses SignalBoost's Supabase
// (credentials resolved through the secrets seam), so the platform is unchanged. The store only
// ever sees ENCRYPTED token blobs — bank executors encrypt/decrypt before/after calling it.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getSecret } from './secrets.ts'

export interface BankTokenRow {
  id?: string
  value_encrypted: string
  iv: string
  tag: string
  expires_at?: string | null
  status?: string
}
export interface SaveBankTokenInput {
  valueEncrypted: string
  iv: string
  tag: string
  last4: string
  expiresIso: string
}
export interface BankComplianceEntry {
  actorId: string | null
  actorEmail: string | null
  institution: string | null
  action: string
  status: string
  accountRef: string | null
  amountCents: number | null
  currency: string | null
  requestId: string | null
  detail: string | null
}

export interface ConsoleDataStore {
  // Resend delivery-status rows keyed by resend_email_id.
  getEmailDeliveryStatus(ids: string[]): Promise<Record<string, any>>
  // Bank: the active encrypted OAuth-token row for a provider key (`bank:<institution>`).
  getBankTokenRow(providerKey: string): Promise<{ ok: boolean; row?: BankTokenRow; notConnected?: boolean; error?: string }>
  // Bank: archive the prior active token and store the new encrypted one.
  saveBankTokenRow(providerKey: string, ownerId: string, enc: SaveBankTokenInput): Promise<{ ok: boolean; error?: string }>
  // Bank: append one compliance/audit row (best-effort — never throws the action).
  logBankCompliance(entry: BankComplianceEntry): Promise<void>
  // Bank: read the compliance audit trail (most recent first).
  listBankCompliance(filter: { institution?: string; limit?: number }): Promise<any[]>
  // Social outreach: OAuth token row for a user+platform (or null).
  getSocialToken(userId: string, platform: string): Promise<any | null>
  // Social outreach: discovered destinations for a user+platform.
  getSocialDestinations(userId: string, platform: string): Promise<any[]>
  // Social outreach: upsert one destination, returning the stored row.
  upsertSocialDestination(dest: Record<string, any>): Promise<any | null>
  // Social outreach: patch a user+platform token row.
  updateSocialToken(userId: string, platform: string, patch: Record<string, any>): Promise<{ ok: boolean; error?: string }>
}

// ── SignalBoost's own adapter (the host implementation). Column mapping lives HERE. ──
function adminClient(): SupabaseClient<any, any, any> | null {
  const url = getSecret('NEXT_PUBLIC_SUPABASE_URL')
  const svc = getSecret('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !svc) return null
  return createClient(url, svc, { auth: { persistSession: false, autoRefreshToken: false } })
}

function defaultSupabaseDataStore(): ConsoleDataStore {
  return {
    async getEmailDeliveryStatus(ids) {
      const db = adminClient()
      if (!db || !ids.length) return {}
      const out: Record<string, any> = {}
      for (let i = 0; i < ids.length; i += 100) {
        const { data } = await db.from('email_delivery_status').select('*').in('resend_email_id', ids.slice(i, i + 100))
        for (const r of (data || [])) out[(r as any).resend_email_id] = r
      }
      return out
    },

    async getBankTokenRow(providerKey) {
      const db = adminClient()
      if (!db) return { ok: false, error: 'Token vault not configured (Supabase service role missing)' }
      const { data, error } = await db
        .from('vault_items')
        .select('id, value_encrypted, iv, tag, expires_at, status')
        .eq('provider', providerKey)
        .eq('label', 'oauth_token')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) return { ok: false, error: error.message }
      if (!data) return { ok: false, notConnected: true }
      return { ok: true, row: data as any }
    },

    async saveBankTokenRow(providerKey, ownerId, enc) {
      const db = adminClient()
      if (!db) return { ok: false, error: 'Token vault not configured' }
      await db.from('vault_items')
        .update({ status: 'archived', archived_at: new Date().toISOString() })
        .eq('provider', providerKey)
        .eq('label', 'oauth_token')
        .eq('status', 'active')
      const { error } = await db.from('vault_items').insert({
        owner_id: ownerId,
        provider: providerKey,
        label: 'oauth_token',
        value_encrypted: enc.valueEncrypted,
        iv: enc.iv,
        tag: enc.tag,
        last4: enc.last4,
        expires_at: enc.expiresIso,
        status: 'active',
      })
      if (error) return { ok: false, error: error.message }
      return { ok: true }
    },

    async logBankCompliance(entry) {
      const db = adminClient()
      if (!db) return
      try {
        await db.from('bank_compliance_log').insert({
          actor_id: entry.actorId,
          actor_email: entry.actorEmail,
          institution: entry.institution,
          action: entry.action,
          status: entry.status,
          account_ref: entry.accountRef,
          amount_cents: entry.amountCents,
          currency: entry.currency,
          request_id: entry.requestId,
          detail: entry.detail,
        })
      } catch {
        // best-effort audit — a missing row must never throw the banking action
      }
    },

    async listBankCompliance(filter) {
      const db = adminClient()
      if (!db) return []
      let q = db.from('bank_compliance_log')
        .select('created_at, institution, action, status, account_ref, amount_cents, currency, actor_email, request_id')
        .order('created_at', { ascending: false })
        .limit(filter.limit ?? 50)
      if (filter.institution) q = q.eq('institution', filter.institution)
      const { data, error } = await q
      if (error) return []
      return data || []
    },

    async getSocialToken(userId, platform) {
      const db = adminClient()
      if (!db) return null
      const { data } = await db.from('outreach_social_tokens').select('*').eq('user_id', userId).eq('platform', platform).maybeSingle()
      return data || null
    },

    async getSocialDestinations(userId, platform) {
      const db = adminClient()
      if (!db) return []
      const { data } = await db.from('outreach_social_destinations').select('platform, account_ref, account_name, kind, access_token, discovered_at').eq('user_id', userId).eq('platform', platform)
      return data || []
    },

    async upsertSocialDestination(dest) {
      const db = adminClient()
      if (!db) return null
      const { data } = await db.from('outreach_social_destinations').upsert(dest, { onConflict: 'user_id,platform,account_ref' }).select('*').single()
      return data || null
    },

    async updateSocialToken(userId, platform, patch) {
      const db = adminClient()
      if (!db) return { ok: false, error: 'Social store not configured' }
      const { error } = await db.from('outreach_social_tokens').update(patch).eq('user_id', userId).eq('platform', platform)
      if (error) return { ok: false, error: error.message }
      return { ok: true }
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
