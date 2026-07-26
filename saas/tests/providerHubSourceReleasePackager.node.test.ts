import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { packageProviderHubRelease } from '../scripts/package-provider-hub-release.mjs'

const SOURCE_SHA = '0123456789abcdef0123456789abcdef01234567'

test('creates a deterministic versioned Provider Hub archive and integrity manifest', () => {
  const outputDirectory = mkdtempSync(join(tmpdir(), 'provider-hub-release-test-'))
  try {
    const first = packageProviderHubRelease({ version: '1.0.0-test.1', sourceCommitSha: SOURCE_SHA, outputDirectory })
    const firstArchive = readFileSync(first.archivePath)
    const firstManifest = JSON.parse(readFileSync(first.manifestPath, 'utf8'))

    const second = packageProviderHubRelease({ version: '1.0.0-test.1', sourceCommitSha: SOURCE_SHA, outputDirectory })
    const secondArchive = readFileSync(second.archivePath)

    assert.deepEqual(secondArchive, firstArchive)
    assert.equal(firstManifest.schemaVersion, 'portable-package-manifest.v1')
    assert.equal(firstManifest.productId, 'provider-hub')
    assert.equal(firstManifest.version, '1.0.0-test.1')
    assert.equal(firstManifest.sourceCommitSha, SOURCE_SHA)
    assert.match(firstManifest.sha256, /^[0-9a-f]{64}$/)
    assert.ok(firstManifest.sizeBytes > 0)
    assert.equal(firstManifest.signingEnabled, false)
    assert.equal(firstManifest.uploadEnabled, false)
    assert.equal(firstManifest.publicationEnabled, false)
    assert.equal(firstManifest.productionExecutionEnabled, false)
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true })
  }
})

test('rejects malformed release identity before touching the filesystem', () => {
  assert.throws(() => packageProviderHubRelease({ version: 'latest', sourceCommitSha: SOURCE_SHA }), /semantic release version/)
  assert.throws(() => packageProviderHubRelease({ version: '1.0.0', sourceCommitSha: 'main' }), /40-character source commit SHA/)
})
