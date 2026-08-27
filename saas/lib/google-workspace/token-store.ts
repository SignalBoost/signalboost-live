// Encrypted, per-user Google Workspace OAuth token storage.
// Browser clients never receive token material; only server-side service-role code can read it.

import { vaultDecrypt, vaultEncrypt } from '@/lib/vault/crypto.ts'
import { getAdminSupabase } from '@/utils/supabase/server.ts'
import { missingGoogleWorkspaceScopes, refreshGoogleWorkspaceToken } from './oauth.ts'

const TABLE = 'google_workspace_connections'
const RENEW_WITHIN_MS = 5 * 60 * 1000

type SecretPayload = { accessToken: string; refreshToken: string | null }

type ConnectionRow = {
  user_id: string
  token_ciphertext: string
  token_iv: string
  token_tag: string
  expires_at: string | null
  scopes: string[] | null
  connected_at: string | null
  updated_at: string | null
  last_error: string | null
}

export type GoogleWorkspaceConnectionStatus = {
  connected: boolean
  expiresAt: string | null
  scopes: string[]
  missingScopes: string[]
  connectedAt: string | null
  updatedAt: string | null
  lastError: string | null
}

export type ValidGoogleWorkspaceToken =
  | { ok: true; accessToken: string; expiresAt: string | null; renewed: boolean }
  | { ok: false; reason: string }

function encryptSecret(secret: SecretPayload) {
  return vaultEncrypt(JSON.stringify(secret))
}

function decryptSecret(row: ConnectionRow): SecretPayload | null {
  const decrypted = vaultDecrypt(row.token_ciphertext, row.token_iv, row.token_tag)
  if (!decrypted.ok || !decrypted.value) return null
  try {
    const parsed = JSON.parse(decrypted.value)
    const accessToken = String(parsed?.accessToken || '').trim()
    if (!accessToken) return null
    return { accessToken, refreshToken: parsed?.refreshToken ? String(parsed.refreshToken) : null }
  } catch {
    return null
  }
}

export async function saveGoogleWorkspaceConnection(input: {
  userId: string
  accessToken: string
  refreshToken: string | null
  expiresAt: string
  scopes: string[]
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const userId = String(input.userId || '').trim()
  if (!userId || !String(input.accessToken || '').trim()) return { ok: false, reason: 'User and access token are required.' }
  if (!input.refreshToken) {
    return { ok: false, reason: 'Google returned no refresh token. Reconnect and approve offline access so the read-only connection can renew safely.' }
  }

  const grantedScopes = Array.isArray(input.scopes) ? input.scopes.map(String) : []
  const missingScopes = missingGoogleWorkspaceScopes(grantedScopes)
  if (missingScopes.length) {
    return {
      ok: false,
      reason: 'Google did not grant all required read-only permissions. Reconnect and approve both Google Sheets read access and Google Drive metadata access.',
    }
  }

  const encrypted = encryptSecret({ accessToken: input.accessToken, refreshToken: input.refreshToken })
  if (!encrypted.ok || !encrypted.valueEncrypted || !encrypted.iv || !encrypted.tag) {
    return { ok: false, reason: encrypted.error || 'Token encryption failed.' }
  }

  const db = getAdminSupabase()
  const now = new Date().toISOString()
  const { error } = await db.from(TABLE).upsert({
    user_id: userId,
    provider: 'google_workspace',
    token_ciphertext: encrypted.valueEncrypted,
    token_iv: encrypted.iv,
    token_tag: encrypted.tag,
    expires_at: input.expiresAt,
    scopes: grantedScopes,
    updated_at: now,
    last_error: null,
  }, { onConflict: 'user_id,provider' })

  if (error) return { ok: false, reason: error.message }
  return { ok: true }
}

export async function getGoogleWorkspaceConnectionStatus(userId: string): Promise<GoogleWorkspaceConnectionStatus> {
  const id = String(userId || '').trim()
  if (!id) return { connected: false, expiresAt: null, scopes: [], missingScopes: [], connectedAt: null, updatedAt: null, lastError: null }
  const db = getAdminSupabase()
  const { data, error } = await db
    .from(TABLE)
    .select('expires_at,scopes,connected_at,updated_at,last_error')
    .eq('user_id', id)
    .eq('provider', 'google_workspace')
    .maybeSingle()
  if (error || !data) return { connected: false, expiresAt: null, scopes: [], missingScopes: [], connectedAt: null, updatedAt: null, lastError: error?.message || null }
  const scopes = Array.isArray(data.scopes) ? data.scopes.map(String) : []
  const missingScopes = missingGoogleWorkspaceScopes(scopes)
  return {
    connected: missingScopes.length === 0,
    expiresAt: data.expires_at || null,
    scopes,
    missingScopes,
    connectedAt: data.connected_at || null,
    updatedAt: data.updated_at || null,
    lastError: data.last_error || null,
  }
}

async function recordError(userId: string, reason: string): Promise<void> {
  try {
    await getAdminSupabase().from(TABLE).update({
      last_error: String(reason).slice(0, 500),
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId).eq('provider', 'google_workspace')
  } catch {
    // The caller receives the failure directly; error persistence is best effort only.
  }
}

export async function getValidGoogleWorkspaceToken(userId: string): Promise<ValidGoogleWorkspaceToken> {
  const id = String(userId || '').trim()
  if (!id) return { ok: false, reason: 'user_id_required' }
  const db = getAdminSupabase()
  const { data, error } = await db.from(TABLE).select('*').eq('user_id', id).eq('provider', 'google_workspace').maybeSingle()
  if (error) return { ok: false, reason: error.message }
  if (!data) return { ok: false, reason: 'Google Sheets is not connected for this user.' }

  const row = data as ConnectionRow
  const rowScopes = Array.isArray(row.scopes) ? row.scopes.map(String) : []
  const missingScopes = missingGoogleWorkspaceScopes(rowScopes)
  if (missingScopes.length) {
    const reason = 'Google connection is missing required read-only permissions. Reconnect and approve both Google Sheets read access and Google Drive metadata access.'
    await recordError(id, reason)
    return { ok: false, reason }
  }

  const secret = decryptSecret(row)
  if (!secret) {
    await recordError(id, 'encrypted token could not be decrypted')
    return { ok: false, reason: 'Google connection credentials could not be decrypted. Reconnect the account.' }
  }

  const expiresAtMs = row.expires_at ? Date.parse(row.expires_at) : 0
  const needsRenewal = !expiresAtMs || expiresAtMs - Date.now() <= RENEW_WITHIN_MS
  if (!needsRenewal) return { ok: true, accessToken: secret.accessToken, expiresAt: row.expires_at || null, renewed: false }
  if (!secret.refreshToken) {
    await recordError(id, 'connection expired without a refresh token')
    return { ok: false, reason: 'Google connection expired and cannot renew. Reconnect the account.' }
  }

  const refreshed = await refreshGoogleWorkspaceToken(secret.refreshToken)
  if ('reason' in refreshed) {
    await recordError(id, refreshed.reason)
    return { ok: false, reason: refreshed.reason }
  }

  const refreshedScopes = refreshed.scopes.length ? refreshed.scopes : rowScopes
  const saved = await saveGoogleWorkspaceConnection({
    userId: id,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken || secret.refreshToken,
    expiresAt: refreshed.expiresAt,
    scopes: refreshedScopes,
  })
  if ('reason' in saved) {
    await recordError(id, saved.reason)
    return { ok: false, reason: saved.reason }
  }
  return { ok: true, accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt, renewed: true }
}

export async function deleteGoogleWorkspaceConnection(userId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const id = String(userId || '').trim()
  if (!id) return { ok: false, reason: 'user_id_required' }
  const { error } = await getAdminSupabase().from(TABLE).delete().eq('user_id', id).eq('provider', 'google_workspace')
  if (error) return { ok: false, reason: error.message }
  return { ok: true }
}
