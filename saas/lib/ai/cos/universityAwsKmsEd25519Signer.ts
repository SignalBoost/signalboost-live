// AWS KMS Ed25519 birth signer, for a server-side, already-authorized Harness host.
// Only ECC_NIST_EDWARDS25519 with ED25519_SHA_512/RAW is compatible with
// University's standard Ed25519 verification. Never use prehashed Ed25519ph.
// AWS KMS signing is invoked only after the caller has verified the durable grant.
import { createPublicKey, verify } from 'node:crypto'
import { issuerKeyFingerprint } from './universityArtifactBirthVerification.ts'
import type { DetachedBirthSigner } from './universityBirthRecordSigningBoundary.ts'

export type Ed25519KmsClient = Readonly<{
  describeKey: (keyId: string) => Promise<{
    KeyMetadata?: { KeySpec?: string; KeyUsage?: string; KeyState?: string }
  }>
  getPublicKey: (keyId: string) => Promise<{
    PublicKey?: Uint8Array
    KeySpec?: string
    KeyUsage?: string
    SigningAlgorithms?: readonly string[]
  }>
  sign: (input: Readonly<{
    KeyId: string
    Message: Uint8Array
    MessageType: 'RAW'
    SigningAlgorithm: 'ED25519_SHA_512'
  }>) => Promise<{ Signature?: Uint8Array; SigningAlgorithm?: string; KeyId?: string }>
}>

export async function createAwsKmsEd25519BirthSigner(input: Readonly<{
  kms: Ed25519KmsClient
  keyId: string
  trustedIssuerFingerprint: string
}>): Promise<Readonly<{ signer: DetachedBirthSigner; issuerPublicKeyPem: string }> | null> {
  if (!input.keyId?.trim() || !/^[a-f0-9]{64}$/i.test(input.trustedIssuerFingerprint)) return null
  try {
    const metadata = (await input.kms.describeKey(input.keyId)).KeyMetadata
    if (metadata?.KeySpec !== 'ECC_NIST_EDWARDS25519'
      || metadata?.KeyUsage !== 'SIGN_VERIFY'
      || metadata?.KeyState !== 'Enabled') return null
    const publicData = await input.kms.getPublicKey(input.keyId)
    if (publicData.KeySpec !== 'ECC_NIST_EDWARDS25519'
      || publicData.KeyUsage !== 'SIGN_VERIFY'
      || !publicData.SigningAlgorithms?.includes('ED25519_SHA_512')
      || !publicData.PublicKey?.length) return null
    const key = createPublicKey({ key: Buffer.from(publicData.PublicKey), format: 'der', type: 'spki' })
    if (key.asymmetricKeyType !== 'ed25519') return null
    const issuerPublicKeyPem = key.export({ type: 'spki', format: 'pem' }).toString()
    if (issuerKeyFingerprint(issuerPublicKeyPem) !== input.trustedIssuerFingerprint.toLowerCase()) return null
    const signer: DetachedBirthSigner = async payload => {
      const outcome = await input.kms.sign({
        KeyId: input.keyId, Message: payload,
        MessageType: 'RAW', SigningAlgorithm: 'ED25519_SHA_512',
      })
      if (outcome.SigningAlgorithm !== 'ED25519_SHA_512'
        || !outcome.Signature || outcome.Signature.length !== 64
        || !verify(null, payload, key, outcome.Signature)) throw new Error('kms_birth_signature_invalid')
      return outcome.Signature
    }
    return { signer, issuerPublicKeyPem }
  } catch { return null }
}
