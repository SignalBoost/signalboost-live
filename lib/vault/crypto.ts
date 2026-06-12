// saas/lib/vault/crypto.ts
// Key Vault encryption engine — AES-256-GCM.
// The master key lives ONLY in the VAULT_MASTER_KEY env var (64 hex chars).
// Values are encrypted before touching the database and decrypted only
// inside the server for an explicit, audited reveal.

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

type EncryptResult = { ok: boolean; valueEncrypted?: string; iv?: string; tag?: string; error?: string }
type DecryptResult = { ok: boolean; value?: string; error?: string }

function getMasterKey(): Buffer | null {
  const hex = process.env.VAULT_MASTER_KEY
  if (!hex || hex.length !== 64) return null
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
