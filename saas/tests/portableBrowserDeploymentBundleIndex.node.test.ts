import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPortableBrowserDeploymentBundleIndex } from '../lib/portable-browser/browser-deployment-bundle-index.ts'

const hashA = 'a'.repeat(64)
const hashB = 'b'.repeat(64)
const hashC = 'c'.repeat(64)
const hashD = 'd'.repeat(64)

const attestation = {
  schemaVersion: '1.0.0' as const,
  attestationId: 'release-attestation-001',
  issuerId: 'buyer-security-office',
  issuedAt: 300,
  purpose: 'buyer_release_attestation' as const,
  subject: {
    productId: 'portable-browser',
    productVersion: '1.0.0',
    installationId: 'buyer-installation-001',
    providerId: 'playwright-local',
  },
  acceptanceEvaluatedAt: 200,
  acceptanceChecks: ['package_integrity', 'startup_preflight'],
  releaseApproved: true as const,
  signingPayload: '{}',
  signatureRequired: true as const,
}

function artifacts() {
  return [
    { path: 'release/attestation.json', role: 'release_attestation' as const, mediaType: 'application/json', sha256: hashC, bytes: 300, required: true },
    { path: 'docs/README.md', role: 'documentation' as const, mediaType: 'text/markdown', sha256: hashD, bytes: 400, required: false },
    { path: 'release/package-manifest.json', role: 'package_manifest' as const, mediaType: 'application/json', sha256: hashA, bytes: 100, required: true },
    { path: 'release/acceptance.json', role: 'installation_acceptance' as const, mediaType: 'application/json', sha256: hashB, bytes: 200, required: true },
  ]
}

test('builds a deterministic immutable buyer deployment bundle index', () => {
  const first = buildPortableBrowserDeploymentBundleIndex({
    bundleId: 'portable-browser-release-001',
    createdAt: 400,
    attestation,
    artifacts: artifacts(),
  })
  const second = buildPortableBrowserDeploymentBundleIndex({
    bundleId: 'portable-browser-release-001',
    createdAt: 400,
    attestation,
    artifacts: [...artifacts()].reverse(),
  })

  assert.deepEqual(first.artifacts.map(artifact => artifact.path), [
    'docs/README.md',
    'release/acceptance.json',
    'release/attestation.json',
    'release/package-manifest.json',
  ])
  assert.equal(first.requiredArtifactCount, 3)
  assert.equal(first.totalBytes, 1000)
  assert.equal(first.canonicalIndexPayload, second.canonicalIndexPayload)
  assert.equal(first.productId, 'portable-browser')
  assert.equal(first.providerId, 'playwright-local')
  assert.ok(Object.isFrozen(first))
  assert.ok(Object.isFrozen(first.artifacts))
  assert.ok(first.artifacts.every(Object.isFrozen))
})

test('requires exactly one required artifact for each core release role', () => {
  assert.throws(() => buildPortableBrowserDeploymentBundleIndex({
    bundleId: 'portable-browser-release-002',
    createdAt: 400,
    attestation,
    artifacts: artifacts().filter(artifact => artifact.role !== 'release_attestation'),
  }), /required_role_invalid:release_attestation/)

  assert.throws(() => buildPortableBrowserDeploymentBundleIndex({
    bundleId: 'portable-browser-release-003',
    createdAt: 400,
    attestation,
    artifacts: [
      ...artifacts(),
      { path: 'release/package-manifest-copy.json', role: 'package_manifest', mediaType: 'application/json', sha256: hashD, bytes: 10, required: true },
    ],
  }), /required_role_invalid:package_manifest/)

  assert.throws(() => buildPortableBrowserDeploymentBundleIndex({
    bundleId: 'portable-browser-release-004',
    createdAt: 400,
    attestation,
    artifacts: artifacts().map(artifact => artifact.role === 'installation_acceptance' ? { ...artifact, required: false } : artifact),
  }), /required_role_invalid:installation_acceptance/)
})

test('rejects unsafe paths, duplicate paths, malformed metadata, and invalid timing', () => {
  assert.throws(() => buildPortableBrowserDeploymentBundleIndex({
    bundleId: 'portable-browser-release-005',
    createdAt: 400,
    attestation,
    artifacts: artifacts().map((artifact, index) => index === 0 ? { ...artifact, path: '../unsafe.json' } : artifact),
  }), /path_invalid/)

  const duplicated = artifacts()
  duplicated.push({ ...duplicated[0], role: 'documentation' })
  assert.throws(() => buildPortableBrowserDeploymentBundleIndex({
    bundleId: 'portable-browser-release-006',
    createdAt: 400,
    attestation,
    artifacts: duplicated,
  }), /duplicate_path/)

  assert.throws(() => buildPortableBrowserDeploymentBundleIndex({
    bundleId: 'portable-browser-release-007',
    createdAt: 299,
    attestation,
    artifacts: artifacts(),
  }), /created_before_attestation/)

  assert.throws(() => buildPortableBrowserDeploymentBundleIndex({
    bundleId: '../invalid',
    createdAt: 400,
    attestation,
    artifacts: artifacts(),
  }), /bundle_id_invalid/)

  assert.throws(() => buildPortableBrowserDeploymentBundleIndex({
    bundleId: 'portable-browser-release-008',
    createdAt: 400,
    attestation,
    artifacts: artifacts().map((artifact, index) => index === 0 ? { ...artifact, sha256: 'bad' } : artifact),
  }), /sha256_invalid/)
})

test('rejects an unapproved or incompatible release attestation', () => {
  assert.throws(() => buildPortableBrowserDeploymentBundleIndex({
    bundleId: 'portable-browser-release-009',
    createdAt: 400,
    attestation: { ...attestation, releaseApproved: false as never },
    artifacts: artifacts(),
  }), /attestation_invalid/)

  assert.throws(() => buildPortableBrowserDeploymentBundleIndex({
    bundleId: 'portable-browser-release-010',
    createdAt: 400,
    attestation: { ...attestation, schemaVersion: '2.0.0' as never },
    artifacts: artifacts(),
  }), /attestation_invalid/)
})
