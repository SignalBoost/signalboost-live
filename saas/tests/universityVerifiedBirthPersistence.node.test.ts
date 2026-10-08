import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import test from 'node:test'
import { canonicalBirthBytes, issuerKeyFingerprint, type SignedBirthIdentity } from '../lib/ai/cos/universityArtifactBirthVerification.ts'
import { persistVerifiedNativeBirth, type SignedBirthStorageRow } from '../lib/ai/cos/universityVerifiedBirthPersistence.ts'

const row = { permanent_artifact_id: 'f2cb6434-a7ac-49ee-88f0-34a94f31a422',
  trained_artifact_hash: 'a'.repeat(64), revision_key: 'b'.repeat(64),
  dataset_hash: 'c'.repeat(64), parent_permanent_artifact_id: null, issuance_kind: 'native_birth' }
const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const pub = publicKey.export({ format: 'pem', type: 'spki' }).toString()
const pin = issuerKeyFingerprint(pub)!
const payload = { permanentArtifactId: row.permanent_artifact_id, trainedArtifactHash: row.trained_artifact_hash,
  revisionKey: row.revision_key, datasetHash: row.dataset_hash, parentPermanentArtifactId: null }
const cert: SignedBirthIdentity = { payload, issuerPublicKeyPem: pub, algorithm: 'ed25519',
  signatureBase64: sign(null, canonicalBirthBytes(payload)!, privateKey).toString('base64') }
function dependencies(opts: { authorized?: boolean; wrongBirth?: boolean; store?: boolean; tamperRead?: boolean } = {}) {
  let writes = 0
  let stored: SignedBirthStorageRow | null = null
  const storage = {
    async readNativeBirth() { return opts.wrongBirth ? { ...row, dataset_hash: 'd'.repeat(64) } : row },
    async insertOnce(record: SignedBirthStorageRow) { writes++; if (opts.store === false) return false; stored = record; return true },
    async readStored() { return opts.tamperRead && stored ? { ...stored, vin: 'AI-' + '0'.repeat(64) } : stored },
  }
  return { authorize: async () => opts.authorized !== false, storage, getWrites: () => writes }
}
test('trusted and authorized exact birth signature is stored and read back', async () => {
  const d = dependencies()
  assert.equal(await persistVerifiedNativeBirth({ certificate: cert, trustedIssuerFingerprint: pin, ...d }), 'verified_persisted')
  assert.equal(d.getWrites(), 1)
})
test('denied authorization prevents any birth lookup and write', async () => {
  const d = dependencies({ authorized: false })
  assert.equal(await persistVerifiedNativeBirth({ certificate: cert, trustedIssuerFingerprint: pin, ...d }), 'not_authorized')
  assert.equal(d.getWrites(), 0)
})
test('birth mismatch, rogue issuer and tampering never reach storage', async () => {
  for (const input of [
    { certificate: cert, pin, wrongBirth: true },
    { certificate: cert, pin: '0'.repeat(64), wrongBirth: false },
    { certificate: { ...cert, payload: { ...payload, datasetHash: 'd'.repeat(64) } }, pin, wrongBirth: false },
  ]) {
    const d = dependencies({ wrongBirth: input.wrongBirth })
    const result = await persistVerifiedNativeBirth({ certificate: input.certificate, trustedIssuerFingerprint: input.pin, ...d })
    assert.notEqual(result, 'verified_persisted')
    assert.equal(d.getWrites(), 0)
  }
})
test('failed storage and altered readback do not claim persistence', async () => {
  for (const opts of [{ store: false }, { tamperRead: true }]) {
    const d = dependencies(opts)
    assert.equal(await persistVerifiedNativeBirth({ certificate: cert, trustedIssuerFingerprint: pin, ...d }), 'storage_failed')
  }
})
