export const PROVIDER_HUB_BUILD_READINESS_SCHEMA_VERSION = 'signalboost-provider-hub-build-readiness-v1' as const

export type ProviderHubBuildReadinessStatus = 'ready' | 'blocked'

export interface ProviderHubBuildReadinessInput {
  manifestPath: string
  serviceWorkerPath: string
  assetLinksPath: string
  iconPaths: readonly string[]
  maskableIconPath: string
  certificateFingerprintReference?: string
  authenticatedLaunchTested: boolean
  unauthenticatedRedirectTested: boolean
  offlineFailureTested: boolean
  androidBackNavigationTested: boolean
}

export interface ProviderHubBuildReadinessReport {
  schemaVersion: typeof PROVIDER_HUB_BUILD_READINESS_SCHEMA_VERSION
  portableId: 'provider-hub'
  status: ProviderHubBuildReadinessStatus
  blockers: readonly string[]
  metadataOnly: true
  appBundleGenerated: false
  signingEnabled: false
  storeSubmissionEnabled: false
  deploymentEnabled: false
}

const APP_PATH = /^\/(?!\/)[^?#]+$/
const SHA256_REFERENCE = /^vault-ref:[a-z0-9][a-z0-9._/-]+$/i

function validPath(value: string): boolean {
  return typeof value === 'string' && APP_PATH.test(value)
}

export function assessProviderHubBuildReadiness(input: ProviderHubBuildReadinessInput): ProviderHubBuildReadinessReport {
  if (!input || typeof input !== 'object') throw new Error('Provider Hub build-readiness input is required')

  const blockers = [
    !validPath(input.manifestPath) && 'manifest-path',
    !validPath(input.serviceWorkerPath) && 'service-worker-path',
    !validPath(input.assetLinksPath) && 'asset-links-path',
    (input.iconPaths.length < 2 || input.iconPaths.some(path => !validPath(path))) && 'icons',
    !validPath(input.maskableIconPath) && 'maskable-icon',
    (!input.certificateFingerprintReference || !SHA256_REFERENCE.test(input.certificateFingerprintReference)) && 'certificate-fingerprint-reference',
    input.authenticatedLaunchTested !== true && 'authenticated-launch',
    input.unauthenticatedRedirectTested !== true && 'unauthenticated-redirect',
    input.offlineFailureTested !== true && 'offline-failure',
    input.androidBackNavigationTested !== true && 'android-back-navigation',
  ].filter((value): value is string => Boolean(value)).sort()

  return Object.freeze({
    schemaVersion: PROVIDER_HUB_BUILD_READINESS_SCHEMA_VERSION,
    portableId: 'provider-hub',
    status: blockers.length === 0 ? 'ready' : 'blocked',
    blockers: Object.freeze(blockers),
    metadataOnly: true,
    appBundleGenerated: false,
    signingEnabled: false,
    storeSubmissionEnabled: false,
    deploymentEnabled: false,
  })
}

export const providerHubBuildReadiness = assessProviderHubBuildReadiness({
  manifestPath: '/provider-hub.webmanifest',
  serviceWorkerPath: '/provider-hub-sw.js',
  assetLinksPath: '/.well-known/assetlinks.json',
  iconPaths: ['/icons/provider-hub-192.png', '/icons/provider-hub-512.png'],
  maskableIconPath: '/icons/provider-hub-512-maskable.png',
  authenticatedLaunchTested: false,
  unauthenticatedRedirectTested: false,
  offlineFailureTested: false,
  androidBackNavigationTested: false,
})
