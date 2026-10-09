// Fail-closed trusted University KMS execution seam.
// The caller must supply a durable independently verified Harness resolver and
// service-role DB. No HTTP request, callback payload or config may manufacture
// a birth-sign capability.
import { readUniversitySigningConfig } from './universityAwsSigningConfig.ts'
import { createUniversityAwsKmsTransport } from './universityAwsKmsTransport.ts'
import { issueUniversityBirthUsingAwsKms } from './universityAwsKmsBirthHost.ts'

type TrustedHost = Omit<Parameters<typeof issueUniversityBirthUsingAwsKms>[0], 'kms' | 'keyId' | 'trustedIssuerFingerprint'>
type KmsSdk = Parameters<typeof createUniversityAwsKmsTransport>[0]['sdk']

export async function executeConfiguredUniversityBirthSigning(input: Readonly<{
  host: TrustedHost
  env: Readonly<Record<string, string | undefined>>
  sdk: KmsSdk
}>) {
  const parsed = readUniversitySigningConfig(input.env)
  if (parsed.ok === false) return parsed.reason
  const { region, keyArn, trustedIssuerFingerprint } = parsed.config
  // Neither an AWS client nor any privileged signer is constructed if the
  // exact pinned configuration is absent or invalid.
  const kms = createUniversityAwsKmsTransport({ region, keyArn, sdk: input.sdk })
  return issueUniversityBirthUsingAwsKms({
    ...input.host, kms, keyId: keyArn, trustedIssuerFingerprint,
  })
}
