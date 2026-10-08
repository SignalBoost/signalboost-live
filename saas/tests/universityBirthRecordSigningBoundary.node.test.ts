import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import test from 'node:test'
import {
  nativeBirthIdentity, signNativeBirthRecord, type BirthRecord,
} from '../lib/ai/cos/universityBirthRecordSigningBoundary.ts'
import { issuerKeyFingerprint, verifyBirthIdentity } from '../lib/ai/cos/universityArtifactBirthVerification.ts'

const record: BirthRecord = {
  permanent_artifact_id: 'f2cb6434-a7ac-49ee-88f0-34a94f31a422',
  trained_artifact_hash: 'a'.repeat(64), revision_key: 'b'.repeat(64),
  dataset_hash: 'c'.repeat(64), parent_permanent_artifact_id: null,
  issuance_kind: 'native_birth',
}
const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const publicPem = publicKey.export({ format: 'pem', type: 'spki' }).toString()
const pin = issuerKeyFingerprint(publicPem)!
const signer = async (bytes: Uint8Array) => sign(null, bytes, privateKey)

test('native complete immutable birth row maps to canonical identity', () => {
  assert.deepEqual(nativeBirthIdentity(record), {
    permanentArtifactId: record.permanent_artifact_id,
    trainedArtifactHash: record.trained_artifact_hash,
    revisionKey: record.revision_key, datasetHash: record.dataset_hash,
    parentPermanentArtifactId: null,
  })
})
test('authorized external signer produces independently verifiable exact-artifact certificate', async () => {
  const cert = await signNativeBirthRecord(record, signer, publicPem, pin)
  assert.ok(cert)
  assert.equal(verifyBirthIdentity(cert!, record.trained_artifact_hash as string, pin).valid, true)
})
test('legacy and incomplete birth records are rejected instead of fabricating history', async () => {
  for (const row of [
    { ...record, issuance_kind: 'legacy_backfill' },
    { ...record, dataset_hash: null },
    { ...record, revision_key: null },
    { ...record, parent_permanent_artifact_id: undefined },
    { ...record, trained_artifact_hash: 'bad' },
  ]) {
    assert.equal(nativeBirthIdentity(row), null)
    assert.equal(await signNativeBirthRecord(row, signer, publicPem, pin), null)
  }
})
test('wrong issuer pin, wrong signing key, malformed signature and failed signer reject issuance', async () => {
  const rogue = generateKeyPairSync('ed25519')
  assert.equal(await signNativeBirthRecord(record, signer, publicPem, '0'.repeat(64)), null)
  assert.equal(await signNativeBirthRecord(record, async bytes => sign(null, bytes, rogue.privateKey), publicPem, pin), null)
  assert.equal(await signNativeBirthRecord(record, async () => new Uint8Array(64), publicPem, pin), null)
  assert.equal(await signNativeBirthRecord(record, async () => { throw Error('external signer unavailable') }, publicPem, pin), null)
})
test('signed row cannot be substituted with changed model hash, dataset or parent', async () => {
  const cert = await signNativeBirthRecord(record, signer, publicPem, pin)
  assert.ok(cert)
  for (const changed of [
    { ...cert!, payload: { ...cert!.payload, datasetHash: 'd'.repeat(64) } },
    { ...cert!, payload: { ...cert!.payload, parentPermanentArtifactId: record.permanent_artifact_id as string } },
  ]) assert.equal(verifyBirthIdentity(changed, record.trained_artifact_hash as string, pin).valid, false)
  assert.equal(verifyBirthIdentity(cert!, 'f'.repeat(64), pin).reason, 'artifact_mismatch')
})
