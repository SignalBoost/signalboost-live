// Trusted server host entrypoint for signing one existing University-native birth.
// NOT a public route: the host supplies the already verified durable Harness
// resolver, service-role DB, and AWS KMS client. No request may mint a run/grant.
import { verifyTrustedBirthGrant, type BirthHarnessAuthorityResolver } from './universityBirthHarnessGrant.ts'
import { createAwsKmsEd25519BirthSigner, type Ed25519KmsClient } from './universityAwsKmsEd25519Signer.ts'
import { issueUniversityNativeBirthWithWriter } from './universityNativeSignedBirthComposition.ts'

type UniversityDb = Parameters<typeof issueUniversityNativeBirthWithWriter>[0]['db']

/** The same verified run is rechecked inside issuance and before persistence. */
export async function issueUniversityBirthUsingAwsKms(input: Readonly<{
  tenantId: string
  harnessRunId: string
  permanentArtifactId: string
  db: UniversityDb
  resolveTrustedRun: BirthHarnessAuthorityResolver
  kms: Ed25519KmsClient
  keyId: string
  trustedIssuerFingerprint: string
}>) {
  const { tenantId, harnessRunId, permanentArtifactId, resolveTrustedRun } = input
  if (!await verifyTrustedBirthGrant({
    tenantId, harnessRunId, permanentArtifactId, approved: true,
  }, resolveTrustedRun)) return 'invalid_grant' as const

  // KMS DescribeKey/GetPublicKey are only invoked after the first durable grant check.
  const kmsSigner = await createAwsKmsEd25519BirthSigner({
    kms: input.kms, keyId: input.keyId,
    trustedIssuerFingerprint: input.trustedIssuerFingerprint,
  })
  if (!kmsSigner) return 'signer_failed' as const
  return issueUniversityNativeBirthWithWriter({
    tenantId, harnessRunId, permanentArtifactId,
    db: input.db, resolveTrustedRun,
    signer: kmsSigner.signer, issuerPublicKeyPem: kmsSigner.issuerPublicKeyPem,
    trustedIssuerFingerprint: input.trustedIssuerFingerprint,
  })
}
