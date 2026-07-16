import type { BrowserProviderCapability } from './provider-capability.ts'
import type { BrowserProviderAdapter } from './provider-adapter.ts'
import type { Capability } from '../supervisor/execution-policy/index.ts'
import type { ProviderWorker } from '../supervisor/providers/provider-worker-schema.ts'

export function mapBrowserProviderCapabilityToSupervisorCapability(capability: BrowserProviderCapability): Capability {
  return {
    capabilityId: capability.capabilityId,
    provider: capability.providerId,
    operation: capability.operation,
    channels: { api: capability.supportsApi, browser: capability.supportsBrowser, manual: true },
    riskClass: capability.riskClass,
    maturity: capability.maturity,
    reversible: capability.reversible,
    idempotent: capability.idempotent,
    supportsAutoFailover: capability.supportsAutoFailover,
    supportsBrowserOnDemand: capability.supportsBrowserOnDemand,
    requiresHumanApproval: capability.requiresHumanApproval,
    approvedOrigins: [...capability.allowedOriginIds],
    verificationProfileId: capability.verificationProfileId,
    browserAdapterId: capability.providerId,
    apiOperationId: capability.supportsApi ? capability.operation : undefined,
    policyVersion: capability.policyVersion ?? 'ha-policy-v1',
    capabilityVersion: capability.capabilityVersion,
    suspendedReason: capability.suspendedReasonCode,
    allowedEnvironments: ['sandbox', 'preview'],
    approvedStepIds: [],
    schemaVersion: 'execution-policy-capability-v1',
  }
}

export function createBrowserProviderWorkerDescriptor(adapter: BrowserProviderAdapter): ProviderWorker {
  return {
    providerKind: adapter.providerId,
    supportedWorkItemTypes: ['browser_provider_metadata'],
    supportedCapabilities: adapter.capabilities.map(capability => capability.capabilityId).sort(),
    adapterVersion: adapter.adapterVersion,
    health: adapter.health.state === 'healthy' ? 'healthy' : adapter.health.state === 'degraded' ? 'degraded' : 'unavailable',
    maximumConcurrentWork: 0,
    executionDependencies: [],
  }
}
