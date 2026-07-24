import { vaultDecrypt, vaultEncrypt } from '../vault/crypto.ts'
import { getProviderConfigStore, type UserProviderConfig } from './providerConfigStore'
export type { UserProviderConfig }

export type PlainProviderConfig = {
  activeProvider: string
  byokEnabled: boolean
  keys: Record<string, string>
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
  return getProviderConfigStore().getUserProviderConfig(userId)
}

export async function saveUserProviderConfig(userId: string, input: PlainProviderConfig) {
  const activeProvider = sanitizeProvider(input.activeProvider)
  if (!activeProvider) throw new Error('activeProvider is required')

  const existing = await getUserProviderConfig(userId)
  const nextKeys = {
    ...((existing?.encrypted_keys as Record<string, unknown> | null) || {}),
    ...encryptProviderKeys(input.keys || {}),
  }

  return getProviderConfigStore().upsertUserProviderConfig({
    user_id: userId,
    active_provider: activeProvider,
    byok_enabled: Boolean(input.byokEnabled),
    encrypted_keys: nextKeys,
  })
}
