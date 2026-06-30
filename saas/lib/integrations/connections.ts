// saas/lib/integrations/connections.ts
// Per-tenant credential resolution for the integration framework. Each org connects
// its own provider accounts; this is the single seam that turns a registry adapter
// into a live, tenant-scoped integration. Service-role reads; RLS protects the rest.
import type { IntegrationContext } from './types'

export interface ConnRow {
  org_id: string
  provider_id: string
  category?: string | null
  auth_kind?: string | null
  access_token?: string | null
  refresh_token?: string | null
  api_key?: string | null
  account_ref?: string | null
  metadata?: Record<string, any> | null
  expires_at?: string | null
}

export async function resolveConnection(admin: any, orgId: string, providerId: string): Promise<IntegrationContext | null> {
  try {
    const { data } = await admin.from('integration_connections').select('*').eq('org_id', orgId).eq('provider_id', providerId).maybeSingle()
    if (!data) return null
    return {
      orgId,
      accessToken: data.access_token || undefined,
      refreshToken: data.refresh_token || undefined,
      apiKey: data.api_key || undefined,
      accountRef: data.account_ref || undefined,
      metadata: data.metadata || undefined,
    }
  } catch { return null }
}

export async function listConnectedProviderIds(admin: any, orgId: string): Promise<string[]> {
  try {
    const { data } = await admin.from('integration_connections').select('provider_id').eq('org_id', orgId)
    return Array.isArray(data) ? data.map((r: any) => r.provider_id) : []
  } catch { return [] }
}

export async function saveConnection(admin: any, row: ConnRow): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await admin.from('integration_connections').upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'org_id,provider_id' })
    return error ? { ok: false, error: error.message } : { ok: true }
  } catch (e: any) { return { ok: false, error: e?.message || 'save failed' } }
}
