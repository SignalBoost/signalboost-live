// saas/lib/hub/vault-operations.ts
// Fetch vault data from Supabase hub_vault_* tables.

import { createClient } from '@supabase/supabase-js'
import { VaultSecret, VaultAuditLog, VaultStats } from './vault-types'

// Lazy init: read env at request time, not module load, so `next build`
// page-data collection never fails when build-time env is absent.
function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase env vars')
  }
  return createClient(supabaseUrl, supabaseKey)
}

/**
 * Fetch all vault secrets for current user
 */
export async function getVaultSecrets(): Promise<{
  ok: boolean
  secrets?: VaultSecret[]
  error?: string
}> {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('hub_vault_secrets')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return { ok: false, error: error.message }
    }

    const secrets: VaultSecret[] = (data || []).map(row => ({
      id: row.id,
      provider_id: row.provider_id,
      provider_name: row.provider_name,
      secret_type: row.secret_type,
      secret_name: row.secret_name,
      masked_value: row.masked_value,
      created_at: row.created_at,
      updated_at: row.updated_at,
      expires_at: row.expires_at,
      last_rotated_at: row.last_rotated_at,
      last_accessed_at: row.last_accessed_at,
      status: row.status,
      tags: row.tags,
      environment: row.environment,
    }))

    return { ok: true, secrets }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}

/**
 * Fetch audit log entries
 */
export async function getVaultAuditLog(limit = 50): Promise<{
  ok: boolean
  logs?: VaultAuditLog[]
  error?: string
}> {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('hub_vault_audit_log')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit)

    if (error) {
      return { ok: false, error: error.message }
    }

    const logs: VaultAuditLog[] = (data || []).map(row => ({
      id: row.id,
      secret_id: row.secret_id,
      action: row.action,
      user_id: row.user_id,
      user_email: row.user_email,
      timestamp: row.timestamp,
      ip_address: row.ip_address,
      status: row.status,
      message: row.message,
    }))

    return { ok: true, logs }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}

/**
 * Calculate vault stats
 */
export async function getVaultStats(): Promise<{
  ok: boolean
  stats?: VaultStats
  error?: string
}> {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('hub_vault_secrets')
      .select('id, status, last_rotated_at')

    if (error) {
      return { ok: false, error: error.message }
    }

    const secrets = data || []
    const now = new Date()
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    const stats: VaultStats = {
      total_secrets: secrets.length,
      active_secrets: secrets.filter(s => s.status === 'active').length,
      expiring_soon: secrets.filter(s => s.status === 'expiring_soon').length,
      expired: secrets.filter(s => s.status === 'expired').length,
      last_rotation: secrets
        .filter(s => s.last_rotated_at)
        .sort((a, b) => new Date(b.last_rotated_at).getTime() - new Date(a.last_rotated_at).getTime())[0]
        ?.last_rotated_at || new Date().toISOString(),
      next_rotation: thirtyDaysFromNow.toISOString(),
    }

    return { ok: true, stats }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}

/**
 * Create a test secret (for demo)
 */
export async function createTestSecret(secret: Omit<VaultSecret, 'id' | 'created_at' | 'updated_at'>): Promise<{
  ok: boolean
  secret?: VaultSecret
  error?: string
}> {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('hub_vault_secrets')
      .insert([
        {
          provider_id: secret.provider_id,
          provider_name: secret.provider_name,
          secret_type: secret.secret_type,
          secret_name: secret.secret_name,
          masked_value: secret.masked_value,
          expires_at: secret.expires_at,
          status: secret.status,
          tags: secret.tags,
          environment: secret.environment,
        },
      ])
      .select()

    if (error) {
      return { ok: false, error: error.message }
    }

    const row = data?.[0]
    if (!row) {
      return { ok: false, error: 'No data returned' }
    }

    return {
      ok: true,
      secret: {
        id: row.id,
        provider_id: row.provider_id,
        provider_name: row.provider_name,
        secret_type: row.secret_type,
        secret_name: row.secret_name,
        masked_value: row.masked_value,
        created_at: row.created_at,
        updated_at: row.updated_at,
        expires_at: row.expires_at,
        last_rotated_at: row.last_rotated_at,
        last_accessed_at: row.last_accessed_at,
        status: row.status,
        tags: row.tags,
        environment: row.environment,
      },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}
