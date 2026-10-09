import assert from 'node:assert/strict'
import test from 'node:test'
import { createPrivateKey, generateKeyPairSync, sign } from 'node:crypto'
import { createAwsKmsEd25519BirthSigner } from '../lib/ai/cos/universityAwsKmsEd25519Signer.ts'
import { issuerKeyFingerprint } from '../lib/ai/cos/universityArtifactBirthVerification.ts'

test('AWS KMS Ed25519 RAW signs and independently verifies exact payload', async () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const kms = {
    describeKey: async () => ({ KeyMetadata: { KeySpec: 'ECC_NIST_EDWARDS25519', KeyUsage: 'SIGN_VERIFY', KeyState: 'Enabled' } }),
    getPublicKey: async () => ({ PublicKey: new Uint8Array(publicKey.export({ type: 'spki', format: 'der' })),
      KeySpec: 'ECC_NIST_EDWARDS25519', KeyUsage: 'SIGN_VERIFY', SigningAlgorithms: ['ED25519_SHA_512'] }),
    sign: async (input: any) => {
      assert.equal(input.MessageType, 'RAW')
      assert.equal(input.SigningAlgorithm, 'ED25519_SHA_512')
      return { Signature: new Uint8Array(sign(null, input.Message, privateKey)), SigningAlgorithm: 'ED25519_SHA_512' }
    },
  }
  const adapter = await createAwsKmsEd25519BirthSigner({ kms, keyId: 'unit-test-only', trustedIssuerFingerprint: issuerKeyFingerprint(pem)! })
  assert.ok(adapter)
  assert.equal((await adapter.signer(new TextEncoder().encode('phase-2'))).length, 64)
  assert.equal(await createAwsKmsEd25519BirthSigner({ kms, keyId: 'unit-test-only', trustedIssuerFingerprint: '0'.repeat(64) }), null)
})

test('rejects mismatched key spec before any signing', async () => {
  const adapter = await createAwsKmsEd25519BirthSigner({
    kms: { describeKey: async () => ({ KeyMetadata: { KeySpec: 'ECC_NIST_P256', KeyUsage: 'SIGN_VERIFY', KeyState: 'Enabled' } }),
      getPublicKey: async () => { throw new Error('must not run') },
      sign: async () => { throw new Error('must not run') } },
    keyId: 'wrong-key', trustedIssuerFingerprint: 'a'.repeat(64),
  })
  assert.equal(adapter, null)
})
