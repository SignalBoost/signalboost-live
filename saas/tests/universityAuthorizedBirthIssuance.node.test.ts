import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import test from 'node:test'
import { issueVerifiedNativeBirth, type TrustedBirthIssuanceGrant } from '../lib/ai/cos/universityAuthorizedBirthIssuance.ts'
import { issuerKeyFingerprint } from '../lib/ai/cos/universityArtifactBirthVerification.ts'
import type { SignedBirthStorageRow } from '../lib/ai/cos/universityVerifiedBirthPersistence.ts'

const id = 'f2cb6434-a7ac-49ee-88f0-34a94f31a422'
const birth = { permanent_artifact_id: id, trained_artifact_hash: 'a'.repeat(64),
  revision_key: 'b'.repeat(64), dataset_hash: 'c'.repeat(64),
  parent_permanent_artifact_id: null, issuance_kind: 'native_birth' }
const keypair = generateKeyPairSync('ed25519')
const pub = keypair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
const pin = issuerKeyFingerprint(pub)!
const grant: TrustedBirthIssuanceGrant = { tenantId: 'tenant-1', harnessRunId: 'run-1', permanentArtifactId: id, approved: true }

function setup(options: { allow?: boolean; legacy?: boolean; crossTenant?: boolean; tamper?: boolean } = {}) {
  let signingCalls = 0
  let writes = 0
  let stored: SignedBirthStorageRow | null = null
  const input = {
    grant,
    verifyGrant: async (g: TrustedBirthIssuanceGrant) => options.allow !== false && g.tenantId === 'tenant-1' && g.harnessRunId === 'run-1',
    readNativeBirth: async (tenant: string) => options.crossTenant || tenant !== 'tenant-1' ? null
      : options.legacy ? { ...birth, issuance_kind: 'legacy_backfill' } : birth,
    signer: async (bytes: Uint8Array) => { signingCalls++; return sign(null, bytes, keypair.privateKey) },
    issuerPublicKeyPem: pub, trustedIssuerFingerprint: pin,
    storage: {
      readNativeBirth: async () => options.crossTenant ? null : birth,
      insertOnce: async (row: SignedBirthStorageRow) => { writes++; stored = row; return true },
      readStored: async () => options.tamper && stored ? { ...stored, vin: 'AI-' + '0'.repeat(64) } : stored,
    },
  }
  return { input, signingCalls: () => signingCalls, writes: () => writes }
}
test('Phase 2: trusted grant signs, verifies and persists exact native birth', async () => {
  const s = setup()
  assert.equal(await issueVerifiedNativeBirth(s.input), 'verified_persisted')
  assert.equal(s.signingCalls(), 1)
  assert.equal(s.writes(), 1)
})
test('Phase 2: absent, denied or cross-tenant grant never invokes signer or writes', async () => {
  for (const options of [{ allow: false }, { crossTenant: true }]) {
    const s = setup(options)
    assert.notEqual(await issueVerifiedNativeBirth(s.input), 'verified_persisted')
    assert.equal(s.signingCalls(), 0)
    assert.equal(s.writes(), 0)
  }
  const s = setup()
  assert.equal(await issueVerifiedNativeBirth({ ...s.input, grant: { ...grant, approved: false } }), 'invalid_grant')
  assert.equal(s.signingCalls(), 0)
})
test('Phase 2: legacy provenance cannot reach external signer', async () => {
  const s = setup({ legacy: true })
  assert.equal(await issueVerifiedNativeBirth(s.input), 'signer_failed')
  assert.equal(s.signingCalls(), 0)
})
test('Phase 2: tampered storage readback cannot prove successful issuance', async () => {
  const s = setup({ tamper: true })
  assert.equal(await issueVerifiedNativeBirth(s.input), 'storage_failed')
})
