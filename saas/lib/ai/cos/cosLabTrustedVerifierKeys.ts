import { createPublicKey } from 'node:crypto'

/** Fail closed unless every configured verifier is an Ed25519 public key. */
export function parseLabTrustedVerifierKeys(raw: string | undefined): Readonly<Record<string, string>> | null {
  if (!raw || raw.length > 100_000) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const entries = Object.entries(parsed)
    if (!entries.length || entries.length > 32) return null
    const keys: Record<string, string> = Object.create(null)
    for (const [id, pem] of entries) {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/.test(id) || typeof pem !== 'string' || pem.length > 4096) return null
      const key = createPublicKey(pem)
      if (key.asymmetricKeyType !== 'ed25519' || key.type !== 'public') return null
      keys[id] = pem
    }
    return Object.freeze(keys)
  } catch {
    return null
  }
}
