import type { BrowserProviderCapability } from './provider-capability.ts'
import { assertBrowserProviderCapability } from './provider-capability.ts'
import type { BrowserProviderEvidenceProfile } from './provider-evidence.ts'
import { assertBrowserProviderEvidenceProfile } from './provider-evidence.ts'
import { BrowserProviderError } from './provider-errors.ts'
import type { BrowserProviderHealth } from './provider-health.ts'
import { assertBrowserProviderHealth } from './provider-health.ts'
import type { BrowserProviderNavigationProfile } from './provider-navigation.ts'
import { assertBrowserProviderNavigationProfile } from './provider-navigation.ts'
import type { BrowserProviderOrigin } from './provider-origin.ts'
import { assertBrowserProviderOrigin } from './provider-origin.ts'
import type { BrowserProviderSelector } from './provider-selector.ts'
import { assertBrowserProviderSelector } from './provider-selector.ts'
import type { BrowserProviderVerificationProfile } from './provider-verification.ts'
import { assertBrowserProviderVerificationProfile } from './provider-verification.ts'
import { BPAL_SCHEMA_VERSION, type BrowserProviderVersion, assertBrowserProviderVersion } from './provider-version.ts'

export type BrowserProviderExecutionMode = 'read_only'

export interface BrowserProviderAdapter {
  providerId: string
  displayNameKey: string
  adapterVersion: string
  schemaVersion: typeof BPAL_SCHEMA_VERSION
  health: BrowserProviderHealth
  capabilities: readonly BrowserProviderCapability[]
  origins: readonly BrowserProviderOrigin[]
  navigationProfiles: readonly BrowserProviderNavigationProfile[]
  selectors: readonly BrowserProviderSelector[]
  verificationProfiles: readonly BrowserProviderVerificationProfile[]
  evidenceProfiles: readonly BrowserProviderEvidenceProfile[]
  supportsExecutionMode(mode: BrowserProviderExecutionMode): boolean
  supportsReadOnlyInspection(): boolean
  supportsAutoFailover(): boolean
  supportsBrowserOnDemand(): boolean
  supportsSandbox(): boolean
  supportsProduction(): boolean
  getVersion(): BrowserProviderVersion
}

export function freezeProviderAdapter(adapter: BrowserProviderAdapter): BrowserProviderAdapter {
  const version = assertBrowserProviderVersion(adapter.getVersion())
  if (
    !adapter.providerId?.trim()
    || !adapter.displayNameKey?.trim()
    || !adapter.adapterVersion?.trim()
    || adapter.schemaVersion !== BPAL_SCHEMA_VERSION
    || version.adapterVersion !== adapter.adapterVersion
    || version.schemaVersion !== adapter.schemaVersion
  ) {
    throw new BrowserProviderError('invalid_provider')
  }

  return Object.freeze({
    ...adapter,
    health: assertBrowserProviderHealth(adapter.health),
    capabilities: Object.freeze(adapter.capabilities.map(assertBrowserProviderCapability).sort((a, b) => a.capabilityId.localeCompare(b.capabilityId))),
    origins: Object.freeze(adapter.origins.map(assertBrowserProviderOrigin).sort((a, b) => a.originId.localeCompare(b.originId))),
    navigationProfiles: Object.freeze(adapter.navigationProfiles.map(assertBrowserProviderNavigationProfile).sort((a, b) => a.navigationProfileId.localeCompare(b.navigationProfileId))),
    selectors: Object.freeze(adapter.selectors.map(assertBrowserProviderSelector).sort((a, b) => a.selectorId.localeCompare(b.selectorId))),
    verificationProfiles: Object.freeze(adapter.verificationProfiles.map(assertBrowserProviderVerificationProfile).sort((a, b) => a.verificationProfileId.localeCompare(b.verificationProfileId))),
    evidenceProfiles: Object.freeze(adapter.evidenceProfiles.map(assertBrowserProviderEvidenceProfile).sort((a, b) => a.evidenceProfileId.localeCompare(b.evidenceProfileId))),
    getVersion: () => version,
  })
}
