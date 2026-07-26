import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  assessProviderHubBuildReadiness,
  providerHubBuildReadiness,
} from '../portable-mobile/provider-hub-build-readiness.ts'

test('Provider Hub build readiness remains blocked until production evidence exists', () => {
  assert.equal(providerHubBuildReadiness.status, 'blocked')
  assert.deepEqual(providerHubBuildReadiness.blockers, [
    'android-back-navigation',
    'authenticated-launch',
    'certificate-fingerprint-reference',
    'offline-failure',
    'unauthenticated-redirect',
  ])
  assert.equal(providerHubBuildReadiness.appBundleGenerated, false)
  assert.equal(providerHubBuildReadiness.signingEnabled, false)
  assert.equal(providerHubBuildReadiness.storeSubmissionEnabled, false)
  assert.ok(Object.isFrozen(providerHubBuildReadiness))
})

test('Provider Hub build readiness is deterministic for complete evidence', () => {
  const input = {
    manifestPath: '/provider-hub.webmanifest',
    serviceWorkerPath: '/provider-hub-sw.js',
    assetLinksPath: '/.well-known/assetlinks.json',
    iconPaths: ['/icons/provider-hub-192.png', '/icons/provider-hub-512.png'],
    maskableIconPath: '/icons/provider-hub-512-maskable.png',
    certificateFingerprintReference: 'vault-ref:android/provider-hub/cert-sha256',
    authenticatedLaunchTested: true,
    unauthenticatedRedirectTested: true,
    offlineFailureTested: true,
    androidBackNavigationTested: true,
  } as const
  assert.deepEqual(assessProviderHubBuildReadiness(input), assessProviderHubBuildReadiness(input))
  assert.equal(assessProviderHubBuildReadiness(input).status, 'ready')
})

test('manifest and asset-links template preserve non-production boundaries', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/provider-hub.webmanifest', import.meta.url), 'utf8'))
  const assetLinks = await readFile(new URL('../public/.well-known/assetlinks.template.json', import.meta.url), 'utf8')
  assert.equal(manifest.start_url, '/dashboard/provider-hub')
  assert.ok(manifest.icons.some((icon: { purpose: string }) => icon.purpose === 'maskable'))
  assert.match(assetLinks, /REPLACE_WITH_APPROVED_PRODUCTION_CERTIFICATE_FINGERPRINT/)
  assert.doesNotMatch(assetLinks, /[A-F0-9]{2}(?::[A-F0-9]{2}){31}/i)
})
