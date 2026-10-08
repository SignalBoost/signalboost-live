// Phase 2 University factory path, before commercial Lab tenant registration.
// This uses the University's existing immutable birth trigger, not lab.artifacts.
// Authorization remains bound to an independently verified active HarnessRun.
// The host must provide a secured signing service and service-role DB adapter.
import { issueHarnessAuthorizedNativeBirth } from './universityHarnessAuthorizedBirthIssuance.ts'
import type { BirthHarnessAuthorityResolver } from './universityBirthHarnessGrant.ts'
import type { BirthRecord, DetachedBirthSigner } from './universityBirthRecordSigningBoundary.ts'
import type { SignedBirthStorageRow } from './universityVerifiedBirthPersistence.ts'

type ReadResult = { data: any; error: unknown }
type Query = {
  select: (columns: string) => Query
  eq: (column: string, value: string) => Query
  maybeSingle: () => Promise<ReadResult>
}
type Db = { from: (table: string) => Query }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function readOne(query: Query): Promise<any | null> {
  const result = await query.maybeSingle()
  if (result.error) throw new Error('phase2_university_birth_read_failed')
  return result.data ?? null
}

export async function issueUniversityNativeHarnessBirth(input: Readonly<{
  tenantId: string
  harnessRunId: string
  permanentArtifactId: string
  db: Db
  resolveTrustedRun: BirthHarnessAuthorityResolver
  signer: DetachedBirthSigner
  issuerPublicKeyPem: string
  trustedIssuerFingerprint: string
  // Server-only privileged insert; database immutable match trigger remains mandatory.
  insertOnce: (row: SignedBirthStorageRow) => Promise<boolean>
}>) {
  const id = input.permanentArtifactId
  if (!UUID.test(id)) return 'invalid_grant' as const
  async function readNativeBirth(artifactId: string): Promise<BirthRecord | null> {
    if (artifactId !== id) return null
    // Both the immutable University certificate and originating artifact must
    // agree: never authorize from birth metadata or user-supplied tenant alone.
    const artifact = await readOne(input.db.from('cos_local_distillation_artifacts')
      .select('permanent_artifact_id,trained_artifact_hash,revision_key')
      .eq('permanent_artifact_id', artifactId))
    if (!artifact || artifact.permanent_artifact_id !== id) return null
    const birth = await readOne(input.db.from('cos_university_artifact_birth_certificates')
      .select('permanent_artifact_id,trained_artifact_hash,revision_key,dataset_hash,parent_permanent_artifact_id,issuance_kind')
      .eq('permanent_artifact_id', artifactId))
    if (!birth || birth.permanent_artifact_id !== id
      || birth.issuance_kind !== 'native_birth'
      || artifact.trained_artifact_hash !== birth.trained_artifact_hash
      || artifact.revision_key !== birth.revision_key) return null
    return birth as BirthRecord
  }
  return issueHarnessAuthorizedNativeBirth({
    tenantId: input.tenantId,
    harnessRunId: input.harnessRunId,
    permanentArtifactId: id,
    resolveTrustedRun: input.resolveTrustedRun,
    signer: input.signer,
    issuerPublicKeyPem: input.issuerPublicKeyPem,
    trustedIssuerFingerprint: input.trustedIssuerFingerprint,
    readNativeBirth: (_tenant, artifact) => readNativeBirth(artifact),
    storage: {
      readNativeBirth,
      insertOnce: row => row.permanent_artifact_id === id ? input.insertOnce(row) : Promise.resolve(false),
      readStored: async artifact => {
        if (artifact !== id) return null
        return readOne(input.db.from('cos_university_signed_birth_envelopes')
          .select('permanent_artifact_id,trained_artifact_hash,revision_key,dataset_hash,parent_permanent_artifact_id,vin,algorithm,signature_base64,issuer_public_key_pem,issuer_fingerprint')
          .eq('permanent_artifact_id', artifact)) as Promise<SignedBirthStorageRow | null>
      },
    },
  })
}
