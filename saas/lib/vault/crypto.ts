// saas/lib/vault/crypto.ts
// Key Vault encryption engine — AES-256-GCM.
// The master key lives ONLY in the VAULT_MASTER_KEY env var (64 hex chars).
// Values are encrypted before touching the database and decrypted only
// inside the server for an explicit, audited reveal.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto'

type EncryptResult = { ok: boolean; valueEncrypted?: string; iv?: string; tag?: string; error?: string }
type DecryptResult = { ok: boolean; value?: string; error?: string }

function getMasterKey(): Buffer | null {
  const hex = process.env.VAULT_MASTER_KEY
  if (!hex || !/^[a-f0-9]{64}$/i.test(hex)) return null
  try { return Buffer.from(hex, 'hex') } catch { return null }
}

export function vaultEncrypt(plain: string): EncryptResult {
  const key = getMasterKey()
  if (!key) return { ok: false, error: 'VAULT_MASTER_KEY not configured (64 hex chars required)' }
  try {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return { ok: true, valueEncrypted: enc.toString('base64'), iv: iv.toString('base64'), tag: tag.toString('base64') }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Encryption failed' }
  }
}

export function vaultDecrypt(valueEncrypted: string, ivB64: string, tagB64: string): DecryptResult {
  const key = getMasterKey()
  if (!key) return { ok: false, error: 'VAULT_MASTER_KEY not configured' }
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    const dec = Buffer.concat([decipher.update(Buffer.from(valueEncrypted, 'base64')), decipher.final()])
    return { ok: true, value: dec.toString('utf8') }
  } catch {
    return { ok: false, error: 'Decryption failed — wrong master key or corrupted data' }
  }
}
// ---------------------------------------------------------------------------------------------------------------
// Tenant-scoped variant (same master key, same algorithm). Each scope (e.g. one LAB organization) gets its own
// HKDF-derived key, and the ciphertext is bound to a caller-supplied context (AAD) such as
// "organization|credential id|provider". A ciphertext copied to another organization or another credential row
// fails authentication instead of decrypting.
// ---------------------------------------------------------------------------------------------------------------
function scopedKey(scope: string): Buffer | null {
  const master = getMasterKey()
  if (!master || !scope) return null
  return Buffer.from(hkdfSync('sha256', master, Buffer.from(scope, 'utf8'), Buffer.from('itmounts-vault-scoped:v1', 'utf8'), 32))
}

export function vaultEncryptScoped(plain: string, scope: string, context: string): EncryptResult {
  const key = scopedKey(scope)
  if (!key) return { ok: false, error: 'VAULT_MASTER_KEY not configured (64 hex chars required)' }
  try {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    cipher.setAAD(Buffer.from(context, 'utf8'))
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    return { ok: true, valueEncrypted: enc.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Encryption failed' }
  }
}

export function vaultDecryptScoped(valueEncrypted: string, ivB64: string, tagB64: string, scope: string, context: string): DecryptResult {
  const key = scopedKey(scope)
  if (!key) return { ok: false, error: 'VAULT_MASTER_KEY not configured' }
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
    decipher.setAAD(Buffer.from(context, 'utf8'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    const dec = Buffer.concat([decipher.update(Buffer.from(valueEncrypted, 'base64')), decipher.final()])
    return { ok: true, value: dec.toString('utf8') }
  } catch {
    return { ok: false, error: 'Decryption failed — wrong scope, context, master key or corrupted data' }
  }
}
