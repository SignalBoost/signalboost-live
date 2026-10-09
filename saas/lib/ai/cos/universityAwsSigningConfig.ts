// Phase 2 fail-closed production configuration for the University AWS KMS signer.
// These are configuration identifiers, never credentials. IAM roles / service
// credentials must be supplied by trusted runtime infrastructure separately.
export type UniversitySigningConfig = Readonly<{
  region: string
  keyArn: string
  trustedIssuerFingerprint: string
}>
export type UniversitySigningConfigResult =
  | Readonly<{ ok: true; config: UniversitySigningConfig }>
  | Readonly<{ ok: false; reason: 'configuration_missing' | 'configuration_invalid' }>

export function readUniversitySigningConfig(env: Readonly<Record<string, string | undefined>>): UniversitySigningConfigResult {
  const region = env.UNIVERSITY_BIRTH_KMS_REGION?.trim() ?? ''
  const keyArn = env.UNIVERSITY_BIRTH_KMS_KEY_ARN?.trim() ?? ''
  const trustedIssuerFingerprint = env.UNIVERSITY_BIRTH_ISSUER_FINGERPRINT_SHA256?.trim().toLowerCase() ?? ''
  if (!region || !keyArn || !trustedIssuerFingerprint) {
    return { ok: false, reason: 'configuration_missing' }
  }
  if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(region)
    || !new RegExp('^arn:aws(?:-us-gov)?:kms:' + region.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&') + ':[0-9]{12}:key/[a-zA-Z0-9-]+$').test(keyArn)
    || !/^[a-f0-9]{64}$/.test(trustedIssuerFingerprint)) {
    return { ok: false, reason: 'configuration_invalid' }
  }
  return { ok: true, config: Object.freeze({ region, keyArn, trustedIssuerFingerprint }) }
}
