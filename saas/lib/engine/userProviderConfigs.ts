import { createClient } from '@supabase/supabase-js'
import { vaultDecrypt, vaultEncrypt } from '../vault/crypto.ts'

export type UserProviderConfig = {
  user_id: string
  active_provider: string
  byok_enabled: boolean
  encrypted_keys: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

export type PlainProviderConfig = {
  activeProvider: string
  byokEnabled: boolean
  keys: Record<string, string>
}

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

type EncryptedKeyEnvelope = {
  valueEncrypted: string
  iv: string
  tag: string
  last4?: string
}

function isEncryptedKeyEnvelope(value: unknown): value is EncryptedKeyEnvelope {
  return Boolean(value)
    && typeof value === 'object'
    && typeof (value as EncryptedKeyEnvelope).valueEncrypted === 'string'
    && typeof (value as EncryptedKeyEnvelope).iv === 'string'
    && typeof (value as EncryptedKeyEnvelope).tag === 'string'
}

function sanitizeProvider(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 80)
}

function sanitizeKeyName(value: unknown) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80)
}

export function encryptProviderKeys(keys: Record<string, unknown>) {
  const encrypted: Record<string, EncryptedKeyEnvelope> = {}

  for (const [rawName, rawValue] of Object.entries(keys || {})) {
    const name = sanitizeKeyName(rawName)
    const value = String(rawValue || '').trim()
    if (!name || !value) continue

    const encryptedValue = vaultEncrypt(value)
    if (!encryptedValue.ok || !encryptedValue.valueEncrypted || !encryptedValue.iv || !encryptedValue.tag) {
      throw new Error(encryptedValue.error || 'Unable to encrypt provider key')
    }

    encrypted[name] = {
      valueEncrypted: encryptedValue.valueEncrypted,
      iv: encryptedValue.iv,
      tag: encryptedValue.tag,
      last4: value.slice(-4),
    }
  }

  return encrypted
}

export function decryptProviderKeys(encryptedKeys: Record<string, unknown> | null | undefined) {
  const decrypted: Record<string, string> = {}

  for (const [name, envelope] of Object.entries(encryptedKeys || {})) {
    if (!isEncryptedKeyEnvelope(envelope)) continue
    const value = vaultDecrypt(envelope.valueEncrypted, envelope.iv, envelope.tag)
    if (!value.ok || typeof value.value !== 'string') throw new Error(value.error || `Unable to decrypt ${name}`)
    decrypted[name] = value.value
  }

  return decrypted
}

export function maskProviderKeys(encryptedKeys: Record<string, unknown> | null | undefined) {
  return Object.fromEntries(
    Object.entries(encryptedKeys || {}).map(([name, envelope]) => {
      const last4 = isEncryptedKeyEnvelope(envelope) && envelope.last4 ? envelope.last4 : ''
      return [name, last4 ? `••••${last4}` : 'saved']
    }),
  )
}

export async function getUserProviderConfig(userId: string): Promise<UserProviderConfig | null> {
  const admin = getAdminSupabase()
  const { data, error } = await admin
    .from('user_provider_configs')
    .select('user_id, active_provider, byok_enabled, encrypted_keys, created_at, updated_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as UserProviderConfig | null
}

export async function saveUserProviderConfig(userId: string, input: PlainProviderConfig) {
  const activeProvider = sanitizeProvider(input.activeProvider)
  if (!activeProvider) throw new Error('activeProvider is required')

  const existing = await getUserProviderConfig(userId)
  const nextKeys = {
    ...((existing?.encrypted_keys as Record<string, unknown> | null) || {}),
    ...encryptProviderKeys(input.keys || {}),
  }

  const admin = getAdminSupabase()
  const { data, error } = await admin
    .from('user_provider_configs')
    .upsert({
      user_id: userId,
      active_provider: activeProvider,
      byok_enabled: Boolean(input.byokEnabled),
      encrypted_keys: nextKeys,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    .select('user_id, active_provider, byok_enabled, encrypted_keys, created_at, updated_at')
    .single()

  if (error) throw new Error(error.message)
  return data as UserProviderConfig
}
