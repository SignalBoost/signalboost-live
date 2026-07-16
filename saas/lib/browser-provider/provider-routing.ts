import type { BrowserProviderAdapter } from './provider-adapter.ts'
import { BrowserProviderError } from './provider-errors.ts'

function invalid(detail: string): never {
  throw new BrowserProviderError('invalid_provider', `invalid_provider:${detail}`)
}

/**
 * Validate the cross-profile routing invariants that a consumer must be able
 * to trust after provider registration.
 *
 * Shape validation lives in provider-adapter.ts. This validator binds each
 * capability to its declared logical origin and proves that every evidence
 * requirement resolves to registered navigation and selector metadata before
 * the provider is published.
 */
export function assertProviderCapabilityRouting(provider: BrowserProviderAdapter): void {
  const navigationById = new Map<string, BrowserProviderAdapter['navigation'][number]>(
    provider.navigation.map(profile => [profile.id, profile]),
  )
  const selectorById = new Map(provider.selectors.map(selector => [selector.id, selector]))
  const evidenceById = new Map(provider.evidence.map(profile => [profile.id, profile]))

  for (const evidence of provider.evidence) {
    for (const navigationId of evidence.expectedScreenshots) {
      if (!navigationById.has(navigationId)) {
        invalid('evidence_screenshot_navigation_reference')
      }
    }

    for (const selectorId of evidence.expectedReads) {
      if (!selectorById.has(selectorId)) {
        invalid('evidence_read_selector_reference')
      }
    }
  }

  for (const capability of provider.capabilities) {
    const navigation = navigationById.get(capability.navigationProfile)
    if (!navigation) invalid('capability_navigation_reference')

    if (!capability.allowedOrigins.includes(navigation.origin)) {
      invalid('capability_navigation_origin_mismatch')
    }

    const evidence = evidenceById.get(capability.evidenceProfile)
    if (!evidence) invalid('capability_evidence_reference')

    for (const navigationId of evidence.expectedScreenshots) {
      const evidenceNavigation = navigationById.get(navigationId)
      if (!evidenceNavigation) invalid('evidence_screenshot_navigation_reference')
      if (!capability.allowedOrigins.includes(evidenceNavigation.origin)) {
        invalid('capability_evidence_navigation_origin_mismatch')
      }
    }

    if (!capability.supportsApi && !capability.supportsBrowser) {
      invalid('capability_transport_missing')
    }

    if (capability.supportsAutoFailover && !capability.supportsBrowser) {
      invalid('capability_auto_failover_requires_browser')
    }

    if (capability.supportsBrowserOnDemand && !capability.supportsBrowser) {
      invalid('capability_on_demand_requires_browser')
    }
  }
}
