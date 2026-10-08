import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import test from 'node:test'
import { issueHarnessAuthorizedNativeBirth } from '../lib/ai/cos/universityHarnessAuthorizedBirthIssuance.ts'
import { issuerKeyFingerprint } from '../lib/ai/cos/universityArtifactBirthVerification.ts'
import { BIRTH_ISSUE_CAPABILITY } from '../lib/ai/cos/universityBirthHarnessGrant.ts'
import type { HarnessManifest } from '../platform-harness/core/types.ts'
import type { SignedBirthStorageRow } from '../lib/ai/cos/universityVerifiedBirthPersistence.ts'

const id = 'f2cb6434-a7ac-49ee-88f0-34a94f31a422'
const birth = { permanent_artifact_id: id, trained_artifact_hash: 'a'.repeat(64),
  revision_key: 'b'.repeat(64), dataset_hash: 'c'.repeat(64),
  parent_permanent_artifact_id: null, issuance_kind: 'native_birth' }
const kp = generateKeyPairSync('ed25519')
const pub = kp.publicKey.export({ format: 'pem', type: 'spki' }).toString()
const manifest: HarnessManifest = {
  runId: 'run1', objective: 'issue birth', profile: 'production',
  environment: { class: 'production', environmentId: 'issuer1' },
  identity: { agentId: 'issuer', role: 'issuer', tenantId: 'tenant1', artifact: { artifactId: id } },
  authorityManifestRef: 'approved-1', limits: {},
  learningFeedbackAllowed: false,
  capabilities: [{ id: BIRTH_ISSUE_CAPABILITY, environments: ['production'],
    risk: 'consequential', mutating: true, scopes: [id] }],
}
function harnessCase(allowed: boolean) {
  let signed = 0
  let reads = 0
  let writes = 0
  let stored: SignedBirthStorageRow | null = null
  const input = {
    tenantId: 'tenant1', harnessRunId: 'run1', permanentArtifactId: id,
    resolveTrustedRun: async () => ({ manifest, status: 'active' as const, authorityVerified: allowed }),
    readNativeBirth: async () => { reads++; return birth },
    signer: async (bytes: Uint8Array) => { signed++; return sign(null, bytes, kp.privateKey) },
    issuerPublicKeyPem: pub, trustedIssuerFingerprint: issuerKeyFingerprint(pub)!,
    storage: {
      readNativeBirth: async () => birth,
      insertOnce: async (row: SignedBirthStorageRow) => { writes++; stored = row; return true },
      readStored: async () => stored,
    },
  }
  return { input, counts: () => ({ signed, reads, writes }) }
}
test('durable Harness verification is mandatory for issuance', async () => {
  const t = harnessCase(true)
  assert.equal(await issueHarnessAuthorizedNativeBirth(t.input), 'verified_persisted')
  assert.deepEqual(t.counts(), { signed: 1, reads: 1, writes: 1 })
})
test('unverified or foreign-tenant run cannot read birth, sign or persist', async () => {
  const denied = harnessCase(false)
  assert.equal(await issueHarnessAuthorizedNativeBirth(denied.input), 'invalid_grant')
  assert.deepEqual(denied.counts(), { signed: 0, reads: 0, writes: 0 })
  const foreign = harnessCase(true)
  assert.equal(await issueHarnessAuthorizedNativeBirth({ ...foreign.input, tenantId: 'foreign' }), 'invalid_grant')
  assert.deepEqual(foreign.counts(), { signed: 0, reads: 0, writes: 0 })
})
test('revocation during issuance stops storage after signing', async () => {
  const t = harnessCase(true)
  let checks = 0
  const result = await issueHarnessAuthorizedNativeBirth({
    ...t.input,
    resolveTrustedRun: async () => ({ manifest, status: 'active' as const, authorityVerified: ++checks < 3 }),
  })
  assert.equal(result, 'not_authorized')
  assert.deepEqual(t.counts(), { signed: 1, reads: 1, writes: 0 })
})
