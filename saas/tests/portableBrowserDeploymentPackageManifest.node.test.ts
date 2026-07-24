import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPortableBrowserDeploymentPackageManifest,
  verifyPortableBrowserDeploymentPackage,
} from '../lib/portable-browser/browser-deployment-package-manifest.ts'

const hashA = 'a'.repeat(64)
const hashB = 'b'.repeat(64)
const hashC = 'c'.repeat(64)

function buildManifest() {
  return buildPortableBrowserDeploymentPackageManifest({
    productId: 'portable-browser',
    productVersion: '1.0.0',
    generatedAt: 100,
    files: [
      { path: 'docs/README.md', sha256: hashB, bytes: 200, required: false, role: 'documentation' },
      { path: 'dist/index.js', sha256: hashA, bytes: 100, required: true, role: 'runtime' },
    ],
  })
}

test('builds a deterministic immutable deployment package manifest', () => {
  const manifest = buildManifest()
  assert.deepEqual(manifest.files.map(file => file.path), ['dist/index.js', 'docs/README.md'])
  assert.equal(manifest.requiredFileCount, 1)
  assert.equal(manifest.totalBytes, 300)
  assert.ok(Object.isFrozen(manifest))
  assert.ok(Object.isFrozen(manifest.files))
})

test('verifies a complete package and tolerates missing optional files', () => {
  const manifest = buildManifest()
  const complete = verifyPortableBrowserDeploymentPackage(manifest, [
    { path: 'dist/index.js', sha256: hashA, bytes: 100 },
    { path: 'docs/README.md', sha256: hashB, bytes: 200 },
  ])
  assert.equal(complete.valid, true)

  const requiredOnly = verifyPortableBrowserDeploymentPackage(manifest, [
    { path: 'dist/index.js', sha256: hashA, bytes: 100 },
  ])
  assert.equal(requiredOnly.valid, true)
})

test('reports missing, changed, resized, and unexpected files', () => {
  const manifest = buildManifest()
  const missing = verifyPortableBrowserDeploymentPackage(manifest, [])
  assert.deepEqual(missing.missingRequiredPaths, ['dist/index.js'])
  assert.equal(missing.valid, false)

  const changed = verifyPortableBrowserDeploymentPackage(manifest, [
    { path: 'dist/index.js', sha256: hashC, bytes: 101 },
    { path: 'extra.txt', sha256: hashA, bytes: 1 },
  ])
  assert.deepEqual(changed.hashMismatchPaths, ['dist/index.js'])
  assert.deepEqual(changed.sizeMismatchPaths, ['dist/index.js'])
  assert.deepEqual(changed.unexpectedPaths, ['extra.txt'])
  assert.equal(changed.valid, false)
})

test('rejects path traversal, duplicate paths, malformed hashes, and invalid versions', () => {
  assert.throws(() => buildPortableBrowserDeploymentPackageManifest({
    productId: 'portable-browser',
    productVersion: '1.0.0',
    generatedAt: 1,
    files: [{ path: '../secret', sha256: hashA, bytes: 1, required: true, role: 'runtime' }],
  }), /path_invalid/)

  assert.throws(() => buildPortableBrowserDeploymentPackageManifest({
    productId: 'portable-browser',
    productVersion: '1.0.0',
    generatedAt: 1,
    files: [
      { path: 'dist/index.js', sha256: hashA, bytes: 1, required: true, role: 'runtime' },
      { path: 'dist/index.js', sha256: hashB, bytes: 2, required: false, role: 'documentation' },
    ],
  }), /duplicate_path/)

  assert.throws(() => buildPortableBrowserDeploymentPackageManifest({
    productId: 'portable-browser',
    productVersion: '1.0.0',
    generatedAt: 1,
    files: [{ path: 'dist/index.js', sha256: 'not-a-hash', bytes: 1, required: true, role: 'runtime' }],
  }), /sha256_invalid/)

  assert.throws(() => buildPortableBrowserDeploymentPackageManifest({
    productId: 'portable-browser',
    productVersion: 'latest',
    generatedAt: 1,
    files: [{ path: 'dist/index.js', sha256: hashA, bytes: 1, required: true, role: 'runtime' }],
  }), /version_invalid/)
})
