// saas/lib/agency/pressProviderConnect.ts
// MANUAL connect path (ONBOARD §12C path 2) for paid press providers. Reuses the canonical
// engine: config lands as provider_registry rows (consumed by universalRunner), and the API
// key is encrypted with the existing Key Vault (lib/vault/crypto) into the existing
// user_provider_keys store. No new table, no plaintext key, no hand-rolled HTTP.
import { getAdminSupabase } from '@/utils/supabase/server'
import { vaultEncrypt, vaultDecrypt } from '@/lib/vault/crypto'

export const PRESS_PAID_PROVIDERS = ['pr_wire', 'media_database', 'ad_platform', 'direct_io'] as const

// Neutral release payload the wire endpoint receives; a brand can override this template.
const DEFAULT_PAYLOAD_TEMPLATE = {
  headline: '{{headline}}',
  body: '{{body}}',
  reference: '{{external_ref}}',
  cta_url: '{{cta_url}}',
  language: '{{language}}',
}

export type ConnectPressProviderInput = {
  ownerUserId: string
  providerId: string
  apiKey: string
  brand?: string
  endpoint: string
  reportEndpoint?: string
  payloadTemplate?: Record<string, unknown>
  refPath?: string
  priceCents?: number
  currency?: string
}

// Author the provider_registry row(s) for a wire brand + vault-store its key.
export async function connectPressProvider(input: ConnectPressProviderInput): Promise<{ ok: boolean; error?: string }> {
  const providerId = String(input.providerId || '').trim()
  const apiKey = String(input.apiKey || '').trim()
  const endpoint = String(input.endpoint || '').trim()
  if (!PRESS_PAID_PROVIDERS.includes(providerId as any)) return { ok: false, error: 'unknown_provider' }
  if (!apiKey) return { ok: false, error: 'api_key_required' }
  if (!/^https?:\/\//i.test(endpoint)) return { ok: false, error: 'valid_endpoint_required' }

  const admin = getAdminSupabase()

  // 1) Vault-store the key in the existing per-user key store (owner-scoped, host-level).
  const enc = vaultEncrypt(apiKey)
  if (!enc.ok || !enc.valueEncrypted || !enc.iv || !enc.tag) return { ok: false, error: enc.error || 'encryption_failed' }
  const keyUpsert = await admin.from('user_provider_keys').upsert({
    user_id: input.ownerUserId,
    provider: providerId,
    value_encrypted: enc.valueEncrypted,
    iv: enc.iv,
    tag: enc.tag,
    last4: apiKey.slice(-4),
  }, { onConflict: 'user_id,provider' })
  if (keyUpsert.error) return { ok: false, error: keyUpsert.error.message }

  const currency = (input.currency || 'USD').trim().toUpperCase().slice(0, 3)
  const priceCents = Number.isFinite(input.priceCents) ? Math.max(0, Math.round(input.priceCents as number)) : 0
  const authHeader = { 'Content-Type': 'application/json', Authorization: 'Bearer {{credentials.api_key}}' }

  // 2) submit_release provider_registry row (config-only; the key is resolved by reference).
  const submitRow = {
    provider_id: providerId,
    action_id: 'submit_release',
    display_name: `${input.brand || providerId} — submit release`,
    is_active: true,
    method: 'POST',
    endpoint_template: endpoint,
    header_template: authHeader,
    payload_template: input.payloadTemplate && Object.keys(input.payloadTemplate).length ? input.payloadTemplate : DEFAULT_PAYLOAD_TEMPLATE,
    output_paths: { ref: input.refPath?.trim() || '$.id' },
    metadata: { price_cents: priceCents, currency, brand: input.brand || null },
  }
  const submit = await admin.from('provider_registry').upsert(submitRow, { onConflict: 'provider_id,action_id' })
  if (submit.error) return { ok: false, error: submit.error.message }

  // 3) Optional fetch_report row for provider-shaped proof polling.
  const report = String(input.reportEndpoint || '').trim()
  if (report) {
    const reportRow = {
      provider_id: providerId,
      action_id: 'fetch_report',
      display_name: `${input.brand || providerId} — distribution report`,
      is_active: true,
      method: 'GET',
      endpoint_template: report,
      header_template: authHeader,
      payload_template: {},
      output_paths: { status: '$.status', completed: '$.completed' },
      metadata: { brand: input.brand || null },
    }
    const rep = await admin.from('provider_registry').upsert(reportRow, { onConflict: 'provider_id,action_id' })
    if (rep.error) return { ok: false, error: rep.error.message }
  }

  return { ok: true }
}

// Host-level key resolve for the runner (vault://<providerId>). One wire account per host.
export async function resolvePressProviderKey(providerId: string): Promise<string | null> {
  try {
    const admin = getAdminSupabase()
    const { data } = await admin
      .from('user_provider_keys')
      .select('value_encrypted, iv, tag')
      .eq('provider', providerId)
      .limit(1)
    const row = Array.isArray(data) ? data[0] : null
    if (!row) return null
    const dec = vaultDecrypt(row.value_encrypted, row.iv, row.tag)
    return dec.ok && dec.value ? dec.value : null
  } catch {
    return null
  }
}

export type PressProviderStatus = { providerId: string; connected: boolean; brand: string | null; priceCents: number; currency: string }

// Which paid providers are connected (an active submit_release row exists) + their price.
export async function pressProviderStatus(): Promise<PressProviderStatus[]> {
  try {
    const admin = getAdminSupabase()
    const { data } = await admin
      .from('provider_registry')
      .select('provider_id, metadata, is_active')
      .in('provider_id', PRESS_PAID_PROVIDERS as unknown as string[])
      .eq('action_id', 'submit_release')
      .eq('is_active', true)
    return (data || []).map((r: any) => ({
      providerId: r.provider_id,
      connected: true,
      brand: r.metadata?.brand ?? null,
      priceCents: Number(r.metadata?.price_cents || 0),
      currency: String(r.metadata?.currency || 'USD'),
    }))
  } catch {
    return []
  }
}

export async function disconnectPressProvider(providerId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = getAdminSupabase()
  const reg = await admin.from('provider_registry').update({ is_active: false }).eq('provider_id', providerId)
  if (reg.error) return { ok: false, error: reg.error.message }
  await admin.from('user_provider_keys').delete().eq('provider', providerId)
  return { ok: true }
}
