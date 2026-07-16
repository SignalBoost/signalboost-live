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
 * capability to the logical origin declared by its navigation profile and
 * rejects transport flags that could otherwise advertise an unusable or
 * broader execution path.
 */
export function assertProviderCapabilityRouting(provider: BrowserProviderAdapter): void {
  const navigationById = new Map(provider.navigation.map(profile => [profile.id, profile]))

  for (const capability of provider.capabilities) {
    const navigation = navigationById.get(capability.navigationProfile)
    if (!navigation) invalid('capability_navigation_reference')

    if (!capability.allowedOrigins.includes(navigation.origin)) {
      invalid('capability_navigation_origin_mismatch')
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
