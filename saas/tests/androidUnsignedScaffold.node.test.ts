import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { createUnsignedAndroidScaffold } from '../portable-mobile/android-scaffold.ts'
import { createAndroidPackagingDescriptor } from '../portable-mobile/android-packaging.ts'
import { providerHubAndroidPackaging } from '../portable-mobile/provider-hub.android.ts'

test('creates a deterministic unsigned Provider Hub TWA scaffold', () => {
  const first = createUnsignedAndroidScaffold(providerHubAndroidPackaging)
  const second = createUnsignedAndroidScaffold(providerHubAndroidPackaging)

  assert.deepEqual(first, second)
  assert.equal(first.state, 'scaffold_ready')
  assert.equal(first.unsigned, true)
  assert.equal(first.appBundleGenerated, false)
  assert.equal(first.signingEnabled, false)
  assert.equal(first.storeSubmissionEnabled, false)
  assert.match(first.files['app/build.gradle.kts'], /com\.signalboost\.providerhub/)
  assert.match(first.files['app/src/main/AndroidManifest.xml'], /https:\/\/signalboostapp\.com\/dashboard\/provider-hub/)
  assert.match(first.files['assetlinks/README.md'], /release certificate fingerprint/)
})

test('fails closed for Capacitor, signing, publication, and signed states', () => {
  const base = {
    ...providerHubAndroidPackaging,
    icons: [...providerHubAndroidPackaging.icons],
    notices: [...providerHubAndroidPackaging.notices],
  }

  assert.throws(() => createUnsignedAndroidScaffold(createAndroidPackagingDescriptor({ ...base, shell: 'capacitor' })), /TWA descriptors only/)
  assert.throws(() => createUnsignedAndroidScaffold(createAndroidPackagingDescriptor({
    ...base,
    signing: { productionKeyConfigured: true, keyReference: 'vault-ref://android/release' },
  })), /rejects signing configuration/)
  assert.throws(() => createUnsignedAndroidScaffold(createAndroidPackagingDescriptor({
    ...base,
    distribution: { playConsoleAppCreated: true, internalTestingPublished: false, productionPublished: false },
  })), /rejects publication claims/)
})

test('scaffold planner has no filesystem, shell, network, signing, or submission capability', async () => {
  const source = await readFile(new URL('../portable-mobile/android-scaffold.ts', import.meta.url), 'utf8')
  for (const forbidden of ['node:fs', 'child_process', 'fetch(', 'exec(', 'spawn(', 'gradlew', 'bundleRelease', 'play console api']) {
    assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, `source must not contain ${forbidden}`)
  }
})
