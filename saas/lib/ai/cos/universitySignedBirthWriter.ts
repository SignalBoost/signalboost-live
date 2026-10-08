// Trusted service-role persistence adapter for Phase 2 University-native birth signatures.
// No public endpoint, key material, grant minting, retries with elevated privileges,
// or overwrite/upsert. The caller must first pass durable Harness authorization.
import type { SignedBirthStorageRow } from './universityVerifiedBirthPersistence.ts'

type InsertResult = { data?: unknown; error?: { code?: string; message?: string } | null }
type InsertQuery = { insert: (row: SignedBirthStorageRow) => Promise<InsertResult> }
type ServiceDb = { from: (table: string) => InsertQuery }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Insert exactly once. Conflicts never overwrite or silently claim a signature passed. */
export function createUniversitySignedBirthInsertOnce(db: ServiceDb) {
  return async (row: SignedBirthStorageRow): Promise<boolean> => {
    if (!row || !UUID.test(row.permanent_artifact_id)
      || row.algorithm !== 'ed25519'
      || !/^AI-[a-f0-9]{64}$/.test(row.vin)
      || !/^[a-f0-9]{64}$/.test(row.issuer_fingerprint)
      || !row.signature_base64 || !row.issuer_public_key_pem) return false
    try {
      const result = await db.from('cos_university_signed_birth_envelopes').insert(row)
      // No upsert. Both unique conflicts and authorization/database failures fail closed.
      return !result.error
    } catch {
      return false
    }
  }
}
