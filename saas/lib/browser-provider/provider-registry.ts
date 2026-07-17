import { createCapabilityRegistry } from './provider-capability.ts'
import type { BrowserProviderAdapter } from './provider-adapter.ts'
import { freezeProviderAdapter } from './provider-adapter.ts'
import { createEvidenceRegistry } from './provider-evidence.ts'
import { BrowserProviderError } from './provider-errors.ts'
import { createNavigationRegistry } from './provider-navigation.ts'
import { createOriginRegistry } from './provider-origin.ts'
import { createSelectorRegistry } from './provider-selector.ts'
import { createVerificationRegistry } from './provider-verification.ts'

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length
}

function assertOwned(providerId: string, items: readonly { providerId: string }[]): void {
  if (items.some(item => item.providerId !== providerId)) throw new BrowserProviderError('invalid_provider')
}

export class BrowserProviderRegistry {
  private readonly byId = new Map<string, BrowserProviderAdapter>()

  register(raw: BrowserProviderAdapter) {
    if (this.byId.has(raw.providerId)) throw new BrowserProviderError('duplicate_provider')

    const provider = freezeProviderAdapter(raw)
    const version = provider.getVersion()
    const capabilityRegistry = createCapabilityRegistry(provider.capabilities)
    const originRegistry = createOriginRegistry(provider.origins)
    const navigationRegistry = createNavigationRegistry(provider.navigationProfiles)
    const selectorRegistry = createSelectorRegistry(provider.selectors)
    const verificationRegistry = createVerificationRegistry(provider.verificationProfiles)
    const evidenceRegistry = createEvidenceRegistry(provider.evidenceProfiles)
    const capabilities = capabilityRegistry.list()
    const capabilityById = new Map(capabilities.map(capability => [capability.capabilityId, capability] as const))
    const capabilityIds = new Set(capabilityById.keys())

    if (
      capabilities.length === 0
      || !provider.supportsExecutionMode('read_only')
      || !provider.supportsReadOnlyInspection()
      || provider.supportsProduction()
      || provider.supportsAutoFailover() !== capabilities.some(capability => capability.supportsAutoFailover)
      || provider.supportsBrowserOnDemand() !== capabilities.some(capability => capability.supportsBrowserOnDemand)
    ) {
      throw new BrowserProviderError('invalid_provider')
    }

    assertOwned(provider.providerId, capabilities)
    assertOwned(provider.providerId, originRegistry.list())
    assertOwned(provider.providerId, navigationRegistry.list())
    assertOwned(provider.providerId, selectorRegistry.list())
    assertOwned(provider.providerId, verificationRegistry.list())
    assertOwned(provider.providerId, evidenceRegistry.list())

    for (const origin of originRegistry.list()) {
      if (
        !origin.readOnlyAllowed
        || origin.productionAllowed
        || origin.environments.includes('production')
        || hasDuplicates(origin.environments)
      ) {
        throw new BrowserProviderError('invalid_provider')
      }
    }

    for (const capability of capabilities) {
      if (
        capability.adapterVersion !== provider.adapterVersion
        || capability.capabilityVersion !== version.capabilityVersion
        || capability.schemaVersion !== provider.schemaVersion
        || (!capability.supportsApi && !capability.supportsBrowser)
        || hasDuplicates(capability.allowedOriginIds)
        || (capability.supportsBrowser && (!capability.navigationProfileId || capability.allowedOriginIds.length === 0))
        || (capability.supportsAutoFailover && (!capability.supportsBrowser || capability.maturity !== 'auto_failover_ready'))
        || (capability.supportsBrowserOnDemand && !capability.supportsBrowser)
      ) {
        throw new BrowserProviderError('invalid_provider')
      }

      const origins = capability.allowedOriginIds.map(originId => originRegistry.get(originId))
      if (
        origins.some(origin => !origin.readOnlyAllowed)
        || (capability.supportsAutoFailover && origins.some(origin => !origin.autoFailoverAllowed))
        || (capability.supportsBrowserOnDemand && origins.some(origin => !origin.browserOnDemandAllowed))
      ) {
        throw new BrowserProviderError('invalid_provider')
      }

      if (capability.navigationProfileId) {
        const navigation = navigationRegistry.get(capability.navigationProfileId)
        if (
          !navigation.readOnly
          || !navigation.supportedCapabilities.includes(capability.capabilityId)
          || !capability.allowedOriginIds.includes(navigation.originId)
        ) {
          throw new BrowserProviderError('invalid_provider')
        }
      }

      const verification = verificationRegistry.get(capability.verificationProfileId)
      const evidence = evidenceRegistry.get(capability.evidenceProfileId)
      if (
        !verification.supportedCapabilities.includes(capability.capabilityId)
        || !evidence.supportedCapabilities.includes(capability.capabilityId)
      ) {
        throw new BrowserProviderError('invalid_provider')
      }
    }

    for (const navigation of navigationRegistry.list()) {
      originRegistry.get(navigation.originId)
      if (navigation.supportedCapabilities.length === 0) throw new BrowserProviderError('invalid_provider')
      for (const capabilityId of navigation.supportedCapabilities) {
        const capability = capabilityById.get(capabilityId)
        if (!capability || !capability.supportsBrowser || capability.navigationProfileId !== navigation.navigationProfileId) {
          throw new BrowserProviderError('invalid_provider')
        }
      }
    }

    for (const selector of selectorRegistry.list()) {
      if (selector.adapterVersion !== provider.adapterVersion || selector.supportedCapabilities.length === 0 || hasDuplicates(selector.supportedCapabilities)) {
        throw new BrowserProviderError('invalid_provider')
      }
      for (const capabilityId of selector.supportedCapabilities) {
        if (!capabilityIds.has(capabilityId)) throw new BrowserProviderError('invalid_provider')
      }
    }

    for (const verification of verificationRegistry.list()) {
      if (
        verification.supportedCapabilities.length === 0
        || verification.requiredReads.length === 0
        || verification.requiredEvidenceTypes.length === 0
        || verification.deterministicComparisonRules.length === 0
        || hasDuplicates(verification.supportedCapabilities)
      ) {
        throw new BrowserProviderError('invalid_provider')
      }
      for (const capabilityId of verification.supportedCapabilities) {
        if (!capabilityIds.has(capabilityId)) throw new BrowserProviderError('invalid_provider')
      }
    }

    for (const evidence of evidenceRegistry.list()) {
      if (
        evidence.supportedCapabilities.length === 0
        || evidence.requiredMetadata.length === 0
        || (evidence.requiredScreenshots.length === 0 && evidence.requiredReads.length === 0)
        || hasDuplicates(evidence.supportedCapabilities)
      ) {
        throw new BrowserProviderError('invalid_provider')
      }
      for (const capabilityId of evidence.supportedCapabilities) {
        if (!capabilityIds.has(capabilityId)) throw new BrowserProviderError('invalid_provider')
      }
    }

    this.byId.set(provider.providerId, provider)
    return provider
  }

  unregister(providerId: string) {
    if (!this.byId.delete(providerId)) throw new BrowserProviderError('unknown_provider')
  }

  get(providerId: string) {
    const provider = this.byId.get(providerId)
    if (!provider) throw new BrowserProviderError('unknown_provider')
    if (provider.health.state === 'suspended') throw new BrowserProviderError('provider_suspended')
    return provider
  }

  has(providerId: string) { return this.byId.has(providerId) }
  list() { return [...this.byId.values()].sort((a, b) => a.providerId.localeCompare(b.providerId)) }
  getCapabilities(providerId: string) { return [...this.get(providerId).capabilities] }
  getHealth(providerId: string) { return this.get(providerId).health }
  getVersion(providerId: string) { return this.get(providerId).getVersion() }
  toJSON() {
    return this.list().map(provider => ({
      providerId: provider.providerId,
      displayNameKey: provider.displayNameKey,
      adapterVersion: provider.adapterVersion,
      schemaVersion: provider.schemaVersion,
      health: provider.health,
      version: provider.getVersion(),
      capabilityIds: provider.capabilities.map(capability => capability.capabilityId),
    }))
  }
}

export { BrowserProviderRegistry as ProviderRegistry }
