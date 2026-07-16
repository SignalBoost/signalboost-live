import { BrowserProviderError } from './provider-errors.ts'
import { BrowserProviderRegistry } from './provider-registry.ts'
import { createBrowserProviderWorkerDescriptor, mapBrowserProviderCapabilityToSupervisorCapability } from './supervisor-integration.ts'
import { VercelBrowserAdapter } from './vercel/vercel-browser-adapter.ts'

export const BROWSER_PROVIDER_DIAGNOSTICS_SCHEMA_VERSION = 'browser-provider-diagnostics-v1' as const

export interface BrowserProviderCapabilityDiagnostics {
  readonly capabilityId: string
  readonly displayNameKey: string
  readonly descriptionKey?: string
  readonly operation: string
  readonly riskClass: string
  readonly maturity: string
  readonly readOnly: true
  readonly reversible: boolean
  readonly idempotent: boolean
  readonly requiresHumanApproval: boolean
  readonly channels: Readonly<{ api: boolean; browser: boolean; manual: boolean }>
  readonly supportsAutoFailover: boolean
  readonly supportsBrowserOnDemand: boolean
  readonly allowedEnvironments: readonly string[]
  readonly allowedOriginIds: readonly string[]
  readonly navigationProfileId?: string
  readonly evidenceProfileId: string
  readonly verificationProfileId: string
  readonly policyVersion: string
  readonly capabilityVersion: string
  readonly productionExecutionEnabled: false
}

export interface BrowserProviderDiagnostics {
  readonly providerId: string
  readonly displayNameKey: string
  readonly adapterVersion: string
  readonly schemaVersion: string
  readonly health: Readonly<{ state: string; checkedAt: string; reasonCode?: string; detailsKey?: string }>
  readonly version: Readonly<{ adapterVersion: string; capabilityVersion: string; schemaVersion: string }>
  readonly support: Readonly<{
    readOnlyInspection: boolean
    sandboxMetadata: boolean
    autoFailoverEnabled: boolean
    browserOnDemandEnabled: boolean
    productionExecutionEnabled: false
  }>
  readonly worker: Readonly<{
    providerKind: string
    supportedWorkItemTypes: readonly string[]
    supportedCapabilities: readonly string[]
    adapterVersion: string
    health: string
    maximumConcurrentWork: 0
    executionDependencies: readonly string[]
  }>
  readonly origins: readonly Readonly<{ originId: string; labelKey: string; exactOrigin: string }>[]
  readonly capabilities: readonly BrowserProviderCapabilityDiagnostics[]
}

export interface BrowserProviderDiagnosticsSnapshot {
  readonly schemaVersion: typeof BROWSER_PROVIDER_DIAGNOSTICS_SCHEMA_VERSION
  readonly productionExecutionEnabled: false
  readonly providers: readonly BrowserProviderDiagnostics[]
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const nested of Object.values(value as unknown as Record<string, unknown>)) deepFreeze(nested)
  }
  return value
}

function createDefaultRegistry(): BrowserProviderRegistry {
  const registry = new BrowserProviderRegistry()
  registry.register(VercelBrowserAdapter)
  return registry
}

export function createBrowserProviderDiagnosticsSnapshot(
  registry: BrowserProviderRegistry = createDefaultRegistry(),
): BrowserProviderDiagnosticsSnapshot {
  const providers = registry.list().map(provider => {
    const worker = createBrowserProviderWorkerDescriptor(provider)
    if (provider.supportsProduction() || worker.maximumConcurrentWork !== 0 || worker.executionDependencies.length > 0) {
      throw new BrowserProviderError('invalid_provider', 'BPAL diagnostics require a zero-execution, production-disabled provider')
    }

    const capabilities = provider.capabilities.map(capability => {
      const policy = mapBrowserProviderCapabilityToSupervisorCapability(capability)
      if (!capability.readOnly || policy.allowedEnvironments.includes('production')) {
        throw new BrowserProviderError('invalid_provider', 'BPAL diagnostics may expose only read-only, non-production policy')
      }

      return {
        capabilityId: capability.capabilityId,
        displayNameKey: capability.displayNameKey,
        descriptionKey: capability.descriptionKey,
        operation: capability.operation,
        riskClass: capability.riskClass,
        maturity: capability.maturity,
        readOnly: true as const,
        reversible: capability.reversible,
        idempotent: capability.idempotent,
        requiresHumanApproval: capability.requiresHumanApproval,
        channels: { ...policy.channels },
        supportsAutoFailover: policy.supportsAutoFailover,
        supportsBrowserOnDemand: policy.supportsBrowserOnDemand,
        allowedEnvironments: [...policy.allowedEnvironments],
        allowedOriginIds: [...policy.approvedOrigins],
        navigationProfileId: capability.navigationProfileId,
        evidenceProfileId: capability.evidenceProfileId,
        verificationProfileId: policy.verificationProfileId,
        policyVersion: policy.policyVersion,
        capabilityVersion: policy.capabilityVersion,
        productionExecutionEnabled: false as const,
      }
    })

    return {
      providerId: provider.providerId,
      displayNameKey: provider.displayNameKey,
      adapterVersion: provider.adapterVersion,
      schemaVersion: provider.schemaVersion,
      health: { ...provider.health },
      version: { ...provider.getVersion() },
      support: {
        readOnlyInspection: provider.supportsReadOnlyInspection(),
        sandboxMetadata: provider.supportsSandbox(),
        autoFailoverEnabled: provider.supportsAutoFailover(),
        browserOnDemandEnabled: provider.supportsBrowserOnDemand(),
        productionExecutionEnabled: false as const,
      },
      worker: {
        ...worker,
        supportedWorkItemTypes: [...worker.supportedWorkItemTypes],
        supportedCapabilities: [...worker.supportedCapabilities],
        maximumConcurrentWork: 0 as const,
        executionDependencies: [...worker.executionDependencies],
      },
      origins: provider.origins.map(origin => ({
        originId: origin.originId,
        labelKey: origin.labelKey,
        exactOrigin: origin.exactOrigin,
      })),
      capabilities,
    }
  })

  return deepFreeze({
    schemaVersion: BROWSER_PROVIDER_DIAGNOSTICS_SCHEMA_VERSION,
    productionExecutionEnabled: false as const,
    providers,
  })
}
