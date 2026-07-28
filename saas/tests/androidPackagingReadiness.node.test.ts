// saas/tests/androidPackagingReadiness.node.test.ts
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  ANDROID_PACKAGING_SCHEMA_VERSION,
  createAndroidPackagingDescriptor,
} from '../portable-mobile/android-packaging.ts'
import { providerHubAndroidPackaging } from '../portable-mobile/provider-hub.android.ts'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'


test('Provider Hub Android packaging metadata is deterministic and non-production', () => {
  assert.equal(providerHubAndroidPackaging.schemaVersion, ANDROID_PACKAGING_SCHEMA_VERSION)
  assert.equal(providerHubAndroidPackaging.portableId, 'provider-hub')
  assert.equal(providerHubAndroidPackaging.shell, 'twa')
  assert.equal(providerHubAndroidPackaging.state, 'build_ready')
  assert.equal(providerHubAndroidPackaging.signing.productionKeyConfigured, false)
  assert.equal(providerHubAndroidPackaging.distribution.playConsoleAppCreated, false)
  assert.equal(providerHubAndroidPackaging.distribution.internalTestingPublished, false)
  assert.equal(providerHubAndroidPackaging.distribution.productionPublished, false)
  assert.ok(providerHubAndroidPackaging.icons.some((icon) => icon.purpose.includes('maskable')))
  assert.deepEqual(providerHubAndroidPackaging.icons.map(icon => icon.src).sort(), ['/icons/provider-hub-192.svg', '/icons/provider-hub-512-maskable.svg'])
  assert.ok(Object.isFrozen(providerHubAndroidPackaging))
})

test('Android packaging validation fails closed for unsafe readiness claims', () => {
  const base = {
    portableId: 'example',
    appName: 'Example',
    packageName: 'com.signalboost.example',
    shell: 'twa' as const,
    launchUrl: 'https://signalboostapp.com/example',
    displayMode: 'standalone' as const,
    orientation: 'any' as const,
    icons: [{ src: '/icons/example-maskable.png', sizes: '512x512' as const, purpose: 'maskable' as const }],
    state: 'metadata_ready' as const,
    signing: { productionKeyConfigured: false },
    distribution: { playConsoleAppCreated: false, internalTestingPublished: false, productionPublished: false },
    notices: ['Metadata only'],
  }

  assert.throws(() => createAndroidPackagingDescriptor({ ...base, packageName: 'SignalBoost' }), /reverse-domain/)
  assert.throws(() => createAndroidPackagingDescriptor({ ...base, launchUrl: 'http://example.com' }), /https/)
  assert.throws(() => createAndroidPackagingDescriptor({ ...base, icons: [] }), /icon/)
  assert.throws(() => createAndroidPackagingDescriptor({
    ...base,
    state: 'signed_bundle_ready',
  }), /production signing key/)
  assert.throws(() => createAndroidPackagingDescriptor({
    ...base,
    signing: { productionKeyConfigured: true, keyReference: '-----BEGIN PRIVATE KEY-----' },
  }), /signing material/)
})

test('Android packaging sources contain no build, signing, or store mutation behavior', async () => {
  const paths = [
    '../portable-mobile/android-packaging.ts',
    '../portable-mobile/provider-hub.android.ts',
  ]
  const forbidden = [
    'node:child_process', 'child_process.exec', 'child_process.spawn', 'gradlew', 'bundletool',
    'jarsigner', 'apksigner', 'play.googleapis.com', 'androidpublisher', 'process.env', 'PRIVATE KEY',
  ]
  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8').then(hydrateLocalizedSource)
    for (const token of forbidden) {
      assert.equal(source.includes(token), false, `${path} must not include ${token}`)
    }
  }
})
