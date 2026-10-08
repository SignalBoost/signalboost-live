// Phase 2: server-only composition of canonical tenant ownership and trusted Harness issuance.
// The host supplies a durable trusted-run resolver, external KMS signer, and a tenant-scoped
// insert adapter. This does not grant authority or expose a public signing endpoint.
import { issueHarnessAuthorizedNativeBirth } from './universityHarnessAuthorizedBirthIssuance.ts'
import { createTenantOwnedBirthSource } from './universityTenantOwnedBirthSource.ts'
import type { BirthHarnessAuthorityResolver } from './universityBirthHarnessGrant.ts'
import type { DetachedBirthSigner } from './universityBirthRecordSigningBoundary.ts'
import type { SignedBirthStorageRow } from './universityVerifiedBirthPersistence.ts'

type Query = {
  select: (columns: string) => Query
  eq: (column: string, value: string) => Query
  maybeSingle: () => Promise<{ data: any; error: unknown }>
}
type Db = {
  schema: (name: string) => { from: (table: string) => Query }
  from: (table: string) => Query
}

export async function issueTenantOwnedHarnessBirth(input: Readonly<{
  tenantId: string
  harnessRunId: string
  permanentArtifactId: string
  db: Db
  resolveTrustedRun: BirthHarnessAuthorityResolver
  signer: DetachedBirthSigner
  issuerPublicKeyPem: string
  trustedIssuerFingerprint: string
  // A privileged host adapter MUST enforce tenant ownership again atomically on insert.
  insertTenantOwnedOnce: (tenantId: string, row: SignedBirthStorageRow) => Promise<boolean>
}>) {
  const source = createTenantOwnedBirthSource(input.db)
  const { tenantId, permanentArtifactId } = input
  return issueHarnessAuthorizedNativeBirth({
    tenantId,
    harnessRunId: input.harnessRunId,
    permanentArtifactId,
    resolveTrustedRun: input.resolveTrustedRun,
    signer: input.signer,
    issuerPublicKeyPem: input.issuerPublicKeyPem,
    trustedIssuerFingerprint: input.trustedIssuerFingerprint,
    readNativeBirth: (tenant, artifact) => source.readBirth(tenant, artifact),
    storage: {
      readNativeBirth: artifact => source.readBirth(tenantId, artifact),
      readStored: artifact => source.readSignedEnvelope(tenantId, artifact),
      insertOnce: row => {
        if (row.permanent_artifact_id !== permanentArtifactId) return Promise.resolve(false)
        return input.insertTenantOwnedOnce(tenantId, row)
      },
    },
  })
}
