// saas/tests/providerHubAndroidBuildReadiness.node.test.ts
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  assessProviderHubBuildReadiness,
  providerHubBuildReadiness,
} from '../portable-mobile/provider-hub-build-readiness.ts'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'


test('Provider Hub is build-ready while production capabilities remain disabled', () => {
  assert.equal(providerHubBuildReadiness.status, 'ready')
  assert.deepEqual(providerHubBuildReadiness.blockers, [])
  assert.equal(providerHubBuildReadiness.appBundleGenerated, false)
  assert.equal(providerHubBuildReadiness.signingEnabled, false)
  assert.equal(providerHubBuildReadiness.storeSubmissionEnabled, false)
  assert.equal(providerHubBuildReadiness.deploymentEnabled, false)
  assert.ok(Object.isFrozen(providerHubBuildReadiness))
  assert.ok(Object.isFrozen(providerHubBuildReadiness.evidence))
  assert.ok(Object.isFrozen(providerHubBuildReadiness.evidence.iconPaths))
})

test('Provider Hub readiness fails closed when launch or failure evidence is missing', () => {
  const input = {
    manifestPath: '/provider-hub.webmanifest',
    serviceWorkerPath: '/provider-hub-sw.js',
    offlineFallbackPath: '/provider-hub-offline.html',
    assetLinksTemplatePath: '/.well-known/assetlinks.template.json',
    iconPaths: ['/icons/provider-hub-192.svg', '/icons/provider-hub-512-maskable.svg'],
    maskableIconPath: '/icons/provider-hub-512-maskable.svg',
    authenticatedLaunchTested: true,
    unauthenticatedRedirectTested: true,
    networkFailureTested: true,
    offlineFailureTested: true,
    androidBackNavigationTested: true,
  } as const
  assert.deepEqual(assessProviderHubBuildReadiness(input), assessProviderHubBuildReadiness(input))
  assert.equal(assessProviderHubBuildReadiness({ ...input, authenticatedLaunchTested: false }).status, 'blocked')
  assert.equal(assessProviderHubBuildReadiness({ ...input, networkFailureTested: false }).status, 'blocked')
  assert.equal(assessProviderHubBuildReadiness({ ...input, maskableIconPath: '/icons/missing.svg' }).status, 'blocked')
  assert.equal(assessProviderHubBuildReadiness({ ...input, manifestPath: '/../secret.webmanifest' }).status, 'blocked')
})

test('manifest, icons, offline fallback, service worker, and asset-links template are repository-owned', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/provider-hub.webmanifest', import.meta.url), 'utf8').then(hydrateLocalizedSource))
  const serviceWorker = await readFile(new URL('../public/provider-hub-sw.js', import.meta.url), 'utf8').then(hydrateLocalizedSource)
  const offline = await readFile(new URL('../public/provider-hub-offline.html', import.meta.url), 'utf8').then(hydrateLocalizedSource)
  const assetLinks = await readFile(new URL('../public/.well-known/assetlinks.template.json', import.meta.url), 'utf8').then(hydrateLocalizedSource)
  const icon = await readFile(new URL('../public/icons/provider-hub-192.svg', import.meta.url), 'utf8').then(hydrateLocalizedSource)
  const maskable = await readFile(new URL('../public/icons/provider-hub-512-maskable.svg', import.meta.url), 'utf8').then(hydrateLocalizedSource)

  assert.equal(manifest.start_url, '/dashboard/provider-hub?source=android-twa')
  assert.equal(manifest.scope, '/dashboard/provider-hub')
  assert.deepEqual(manifest.icons.map((entry: { src: string }) => entry.src).sort(), ['/icons/provider-hub-192.svg', '/icons/provider-hub-512-maskable.svg'])
  assert.ok(manifest.icons.some((entry: { purpose: string }) => entry.purpose === 'maskable'))
  assert.match(serviceWorker, /provider-hub-offline\.html/)
  assert.match(serviceWorker, /request\.mode !== 'navigate'/)
  assert.match(offline, /No provider action was attempted/)
  assert.match(assetLinks, /REPLACE_WITH_APPROVED_PRODUCTION_CERTIFICATE_FINGERPRINT/)
  assert.doesNotMatch(assetLinks, /[A-F0-9]{2}(?::[A-F0-9]{2}){31}/i)
  assert.match(icon, /width="192"/)
  assert.match(maskable, /width="512"/)
})

test('build-readiness sources contain no signing, upload, or store mutation behavior', async () => {
  const paths = [
    '../portable-mobile/provider-hub-build-readiness.ts',
    '../public/provider-hub-sw.js',
  ]
  const forbidden = ['node:child_process', 'gradlew', 'bundletool', 'jarsigner', 'apksigner', 'androidpublisher', 'play.googleapis.com', 'process.env', 'PRIVATE KEY']
  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8').then(hydrateLocalizedSource)
    for (const token of forbidden) assert.equal(source.includes(token), false, `${path} must not include ${token}`)
  }
})
