import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { createUnsignedAndroidScaffold } from '../portable-mobile/android-scaffold.ts'
import {
  createAndroidScaffoldReviewBundle,
  verifyAndroidScaffoldReviewBundle,
} from '../portable-mobile/android-scaffold-review-bundle.ts'
import { providerHubAndroidPackaging } from '../portable-mobile/provider-hub.android.ts'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'


test('creates a deterministic immutable Provider Hub scaffold review bundle', () => {
  const scaffold = createUnsignedAndroidScaffold(providerHubAndroidPackaging)
  const first = createAndroidScaffoldReviewBundle(scaffold)
  const second = createAndroidScaffoldReviewBundle(scaffold)

  assert.deepEqual(first, second)
  assert.equal(first.state, 'review_bundle_ready')
  assert.equal(first.fileCount, Object.keys(scaffold.files).length)
  assert.equal(first.filesystemWritesEnabled, false)
  assert.equal(first.archiveGenerated, false)
  assert.equal(first.appBundleGenerated, false)
  assert.equal(first.signingEnabled, false)
  assert.equal(first.storeSubmissionEnabled, false)
  assert.ok(first.files.every((file, index) => index === 0 || first.files[index - 1].path.localeCompare(file.path) < 0))
  assert.ok(first.files.every(file => /^fnv1a32:[0-9a-f]{8}$/.test(file.digest)))
  assert.match(first.bundleDigest, /^fnv1a32:[0-9a-f]{8}$/)
  assert.equal(verifyAndroidScaffoldReviewBundle(first), true)
  assert.ok(Object.isFrozen(first))
  assert.ok(Object.isFrozen(first.files))
})

test('verification fails closed for changed content, digest, ordering, and safety flags', () => {
  const bundle = createAndroidScaffoldReviewBundle(createUnsignedAndroidScaffold(providerHubAndroidPackaging))
  const changedContent = {
    ...bundle,
    files: bundle.files.map((file, index) => index === 0 ? { ...file, content: `${file.content}\nchanged` } : file),
  }
  assert.equal(verifyAndroidScaffoldReviewBundle(changedContent), false)
  assert.equal(verifyAndroidScaffoldReviewBundle({ ...bundle, bundleDigest: 'fnv1a32:00000000' }), false)
  assert.equal(verifyAndroidScaffoldReviewBundle({ ...bundle, files: [...bundle.files].reverse() }), false)
  assert.equal(verifyAndroidScaffoldReviewBundle({ ...bundle, signingEnabled: true }), false)
})

test('review bundle rejects unsafe paths and signing material', () => {
  const scaffold = createUnsignedAndroidScaffold(providerHubAndroidPackaging)
  assert.throws(() => createAndroidScaffoldReviewBundle({
    ...scaffold,
    files: { '../outside.txt': 'unsafe' },
  }), /unsafe scaffold path/)
  assert.throws(() => createAndroidScaffoldReviewBundle({
    ...scaffold,
    files: { 'app/secrets.properties': 'storePassword=secret' },
  }), /signing material/)
})

test('review bundle source has no filesystem, archive, build, signing, or submission capability', async () => {
  const source = await readFile(new URL('../portable-mobile/android-scaffold-review-bundle.ts', import.meta.url), 'utf8').then(hydrateLocalizedSource)
  for (const forbidden of ['node:fs', 'child_process', 'writeFile(', 'mkdir(', 'archiver', 'zip(', 'gradlew', 'bundleRelease', 'androidpublisher', 'fetch(']) {
    assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, `source must not contain ${forbidden}`)
  }
})
