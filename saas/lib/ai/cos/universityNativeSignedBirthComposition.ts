// Composition of University-native birth issuance with insert-only persistence.
// Only a trusted server Harness host may call this with an independently resolved,
// active grant and protected Ed25519 signer. This is not a route or credential source.
import { issueUniversityNativeHarnessBirth } from './universityNativeHarnessBirth.ts'
import { createUniversitySignedBirthInsertOnce } from './universitySignedBirthWriter.ts'
import type { BirthHarnessAuthorityResolver } from './universityBirthHarnessGrant.ts'
import type { DetachedBirthSigner } from './universityBirthRecordSigningBoundary.ts'
import type { SignedBirthStorageRow } from './universityVerifiedBirthPersistence.ts'

type ReadQuery = {
  select: (columns: string) => ReadQuery
  eq: (column: string, value: string) => ReadQuery
  maybeSingle: () => Promise<{ data: any; error: unknown }>
}
type Db = {
  from: (table: string) => ReadQuery & {
    insert: (row: SignedBirthStorageRow) => Promise<{ error?: { code?: string; message?: string } | null }>
  }
}

/** Keep grant verification inside issueUniversityNativeHarnessBirth, never in an API request. */
export function issueUniversityNativeBirthWithWriter(input: Readonly<{
  tenantId: string
  harnessRunId: string
  permanentArtifactId: string
  db: Db
  resolveTrustedRun: BirthHarnessAuthorityResolver
  signer: DetachedBirthSigner
  issuerPublicKeyPem: string
  trustedIssuerFingerprint: string
}>) {
  return issueUniversityNativeHarnessBirth({
    ...input,
    insertOnce: createUniversitySignedBirthInsertOnce(input.db),
  })
}
