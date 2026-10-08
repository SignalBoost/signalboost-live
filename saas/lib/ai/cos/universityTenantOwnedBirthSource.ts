// Phase 2: server-only, fail-closed tenant isolation for certificate audit reads.
// A service-role client bypasses RLS; this adapter MUST NOT be exposed to user-controlled queries.
// The Harness audit capability and authenticated tenant membership remain separate requirements.
import type { AuthorizedBirthAuditSource } from './universityAuthorizedBirthAudit.ts'
import type { BirthRecord } from './universityBirthRecordSigningBoundary.ts'
import type { SignedBirthStorageRow } from './universityVerifiedBirthPersistence.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type Query = {
  select: (columns: string) => Query
  eq: (column: string, value: string) => Query
  maybeSingle: () => Promise<{ data: any; error: unknown }>
}
type Db = { schema: (name: string) => { from: (table: string) => Query }; from: (table: string) => Query }

async function exactlyOne(query: Query): Promise<any | null> {
  const result = await query.maybeSingle()
  if (result.error) throw new Error('phase2_tenant_bound_read_failed')
  return result.data ?? null
}

export function createTenantOwnedBirthSource(db: Db): AuthorizedBirthAuditSource {
  async function assertOwned(tenantId: string, artifactId: string): Promise<void> {
    if (!UUID.test(tenantId) || !UUID.test(artifactId)) throw new Error('phase2_invalid_identity')
    // Only the canonical Lab record can establish tenant ownership. No fallback to
    // candidate_id, caller-provided organization, or unscoped birth metadata.
    const owned = await exactlyOne(db.schema('lab').from('artifacts')
      .select('permanent_artifact_id,organization_id')
      .eq('permanent_artifact_id', artifactId)
      .eq('organization_id', tenantId))
    if (!owned || owned.permanent_artifact_id !== artifactId
      || owned.organization_id !== tenantId) throw new Error('phase2_artifact_not_owned')
  }
  return Object.freeze({
    async readBirth(tenantId: string, id: string): Promise<BirthRecord | null> {
      await assertOwned(tenantId, id)
      const row = await exactlyOne(db.from('cos_university_artifact_birth_certificates')
        .select('permanent_artifact_id,trained_artifact_hash,revision_key,dataset_hash,parent_permanent_artifact_id,issuance_kind')
        .eq('permanent_artifact_id', id))
      await assertOwned(tenantId, id)
      if (row && row.permanent_artifact_id !== id) throw new Error('phase2_birth_identity_mismatch')
      return row as BirthRecord | null
    },
    async readSignedEnvelope(tenantId: string, id: string): Promise<SignedBirthStorageRow | null> {
      await assertOwned(tenantId, id)
      const row = await exactlyOne(db.from('cos_university_signed_birth_envelopes')
        .select('permanent_artifact_id,trained_artifact_hash,revision_key,dataset_hash,parent_permanent_artifact_id,vin,algorithm,signature_base64,issuer_public_key_pem,issuer_fingerprint')
        .eq('permanent_artifact_id', id))
      await assertOwned(tenantId, id)
      if (row && row.permanent_artifact_id !== id) throw new Error('phase2_signed_birth_identity_mismatch')
      return row as SignedBirthStorageRow | null
    },
  })
}
