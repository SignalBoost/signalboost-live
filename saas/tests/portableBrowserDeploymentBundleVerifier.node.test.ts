import test from 'node:test'
import assert from 'node:assert/strict'
import {
  verifyPortableBrowserDeploymentBundle,
} from '../lib/portable-browser/browser-deployment-bundle-verifier.ts'
import type { PortableBrowserDeploymentBundleIndex } from '../lib/portable-browser/browser-deployment-bundle-index.ts'

const hashA = 'a'.repeat(64)
const hashB = 'b'.repeat(64)
const hashC = 'c'.repeat(64)

const index: PortableBrowserDeploymentBundleIndex = {
  schemaVersion: '1.0.0',
  bundleId: 'bundle-001',
  createdAt: 300,
  productId: 'portable-browser',
  productVersion: '1.0.0',
  installationId: 'buyer-installation-001',
  providerId: 'playwright-local',
  issuerId: 'buyer-security',
  attestationId: 'attestation-001',
  artifacts: [
    { path: 'acceptance.json', role: 'installation_acceptance', mediaType: 'application/json', sha256: hashA, bytes: 100, required: true },
    { path: 'attestation.json', role: 'release_attestation', mediaType: 'application/json', sha256: hashB, bytes: 200, required: true },
    { path: 'docs/README.md', role: 'documentation', mediaType: 'text/markdown', sha256: hashC, bytes: 300, required: false },
    { path: 'manifest.json', role: 'package_manifest', mediaType: 'application/json', sha256: hashA, bytes: 400, required: true },
  ],
  requiredArtifactCount: 3,
  totalBytes: 1000,
  canonicalIndexPayload: '{}',
}

test('verifies a complete deployment bundle deterministically', () => {
  const result = verifyPortableBrowserDeploymentBundle(index, [
    { path: 'manifest.json', sha256: hashA, bytes: 400 },
    { path: 'acceptance.json', sha256: hashA, bytes: 100 },
    { path: 'docs/README.md', sha256: hashC, bytes: 300 },
    { path: 'attestation.json', sha256: hashB, bytes: 200 },
  ])

  assert.equal(result.verified, true)
  assert.deepEqual(result.failureCodes, [])
  assert.equal(result.bundleId, 'bundle-001')
  assert.equal(result.productId, 'portable-browser')
  assert.equal(result.providerId, 'playwright-local')
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.failureCodes))
})

test('allows omitted optional artifacts', () => {
  const result = verifyPortableBrowserDeploymentBundle(index, [
    { path: 'acceptance.json', sha256: hashA, bytes: 100 },
    { path: 'attestation.json', sha256: hashB, bytes: 200 },
    { path: 'manifest.json', sha256: hashA, bytes: 400 },
  ])

  assert.equal(result.verified, true)
  assert.deepEqual(result.missingRequiredPaths, [])
})

test('fails closed with deterministic missing, changed, resized, and unexpected findings', () => {
  const result = verifyPortableBrowserDeploymentBundle(index, [
    { path: 'acceptance.json', sha256: hashB, bytes: 101 },
    { path: 'attestation.json', sha256: hashB, bytes: 200 },
    { path: 'extra.txt', sha256: hashC, bytes: 1 },
  ])

  assert.equal(result.verified, false)
  assert.deepEqual(result.missingRequiredPaths, ['manifest.json'])
  assert.deepEqual(result.hashMismatchPaths, ['acceptance.json'])
  assert.deepEqual(result.sizeMismatchPaths, ['acceptance.json'])
  assert.deepEqual(result.unexpectedPaths, ['extra.txt'])
  assert.deepEqual(result.failureCodes, [
    'bundle_hash_mismatch:acceptance.json',
    'bundle_missing_required:manifest.json',
    'bundle_size_mismatch:acceptance.json',
    'bundle_unexpected_artifact:extra.txt',
  ])
})

test('rejects incompatible indexes and malformed observed artifacts', () => {
  assert.throws(() => verifyPortableBrowserDeploymentBundle({ ...index, schemaVersion: '2.0.0' as never }, []), /index_invalid/)
  assert.throws(() => verifyPortableBrowserDeploymentBundle(index, [
    { path: '../unsafe', sha256: hashA, bytes: 1 },
  ]), /path_invalid/)
  assert.throws(() => verifyPortableBrowserDeploymentBundle(index, [
    { path: 'manifest.json', sha256: 'bad', bytes: 1 },
  ]), /sha256_invalid/)
  assert.throws(() => verifyPortableBrowserDeploymentBundle(index, [
    { path: 'manifest.json', sha256: hashA, bytes: -1 },
  ]), /bytes_invalid/)
  assert.throws(() => verifyPortableBrowserDeploymentBundle(index, [
    { path: 'manifest.json', sha256: hashA, bytes: 400 },
    { path: 'manifest.json', sha256: hashA, bytes: 400 },
  ]), /duplicate_path/)
})
