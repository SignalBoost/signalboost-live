// saas/portable-mobile/provider-hub-build-readiness.ts
export const PROVIDER_HUB_BUILD_READINESS_SCHEMA_VERSION = 'signalboost-provider-hub-build-readiness-v1' as const

export type ProviderHubBuildReadinessStatus = 'ready' | 'blocked'

export interface ProviderHubBuildReadinessInput {
  manifestPath: string
  serviceWorkerPath: string
  offlineFallbackPath: string
  assetLinksTemplatePath: string
  iconPaths: readonly string[]
  maskableIconPath: string
  authenticatedLaunchTested: boolean
  unauthenticatedRedirectTested: boolean
  networkFailureTested: boolean
  offlineFailureTested: boolean
  androidBackNavigationTested: boolean
}

export interface ProviderHubBuildReadinessReport {
  schemaVersion: typeof PROVIDER_HUB_BUILD_READINESS_SCHEMA_VERSION
  portableId: 'provider-hub'
  status: ProviderHubBuildReadinessStatus
  blockers: readonly string[]
  evidence: Readonly<{
    manifestPath: string
    serviceWorkerPath: string
    offlineFallbackPath: string
    assetLinksTemplatePath: string
    iconPaths: readonly string[]
    maskableIconPath: string
  }>
  metadataOnly: true
  appBundleGenerated: false
  signingEnabled: false
  storeSubmissionEnabled: false
  deploymentEnabled: false
}

const APP_PATH = /^\/(?!\/)(?!.*\.\.)(?!.*[?#])[^?#]+$/

function validPath(value: string): boolean {
  return typeof value === 'string' && APP_PATH.test(value)
}

export function assessProviderHubBuildReadiness(input: ProviderHubBuildReadinessInput): ProviderHubBuildReadinessReport {
  if (!input || typeof input !== 'object') throw new Error('Provider Hub build-readiness input is required')
  const iconPaths = [...new Set(input.iconPaths)].sort()
  const blockers = [
    !validPath(input.manifestPath) && 'manifest-path',
    !validPath(input.serviceWorkerPath) && 'service-worker-path',
    !validPath(input.offlineFallbackPath) && 'offline-fallback-path',
    !validPath(input.assetLinksTemplatePath) && 'asset-links-template-path',
    (iconPaths.length < 2 || iconPaths.some(path => !validPath(path))) && 'icons',
    (!validPath(input.maskableIconPath) || !iconPaths.includes(input.maskableIconPath)) && 'maskable-icon',
    input.authenticatedLaunchTested !== true && 'authenticated-launch',
    input.unauthenticatedRedirectTested !== true && 'unauthenticated-redirect',
    input.networkFailureTested !== true && 'network-failure',
    input.offlineFailureTested !== true && 'offline-failure',
    input.androidBackNavigationTested !== true && 'android-back-navigation',
  ].filter((value): value is string => Boolean(value)).sort()

  return Object.freeze({
    schemaVersion: PROVIDER_HUB_BUILD_READINESS_SCHEMA_VERSION,
    portableId: 'provider-hub',
    status: blockers.length === 0 ? 'ready' : 'blocked',
    blockers: Object.freeze(blockers),
    evidence: Object.freeze({
      manifestPath: input.manifestPath,
      serviceWorkerPath: input.serviceWorkerPath,
      offlineFallbackPath: input.offlineFallbackPath,
      assetLinksTemplatePath: input.assetLinksTemplatePath,
      iconPaths: Object.freeze(iconPaths),
      maskableIconPath: input.maskableIconPath,
    }),
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
  offlineFallbackPath: '/provider-hub-offline.html',
  assetLinksTemplatePath: '/.well-known/assetlinks.template.json',
  iconPaths: ['/icons/provider-hub-192.svg', '/icons/provider-hub-512-maskable.svg'],
  maskableIconPath: '/icons/provider-hub-512-maskable.svg',
  authenticatedLaunchTested: true,
  unauthenticatedRedirectTested: true,
  networkFailureTested: true,
  offlineFailureTested: true,
  androidBackNavigationTested: true,
})
