import type { BrowserProviderCapability, BrowserProviderCapabilityMaturity, BrowserProviderRiskClass } from './provider-capability.ts'
import type { BrowserProviderAdapter } from './provider-adapter.ts'
import { BrowserProviderError } from './provider-errors.ts'
import type { BrowserProviderHealthState } from './provider-health.ts'
import type { Capability } from '../supervisor/execution-policy/index.ts'
import type { ProviderWorker } from '../supervisor/providers/provider-worker-schema.ts'

export interface BrowserProviderPolicyReviewCapability {
  capabilityId: string
  displayNameKey: string
  descriptionKey?: string
  operation: string
  riskClass: BrowserProviderRiskClass
  maturity: BrowserProviderCapabilityMaturity
  readOnly: true
  channels: Readonly<{ api: boolean; browser: boolean; manual: true }>
  requiresHumanApproval: boolean
  supportsAutoFailover: boolean
  supportsBrowserOnDemand: boolean
  reversible: boolean
  idempotent: boolean
  approvedOriginIds: readonly string[]
  allowedEnvironments: readonly ('sandbox' | 'preview')[]
  navigationProfileId?: string
  verificationProfileId: string
  evidenceProfileId: string
  policyVersion: string
  capabilityVersion: string
}

export interface BrowserProviderPolicyReviewSnapshot {
  providerId: string
  displayNameKey: string
  adapterVersion: string
  capabilityVersion: string
  schemaVersion: string
  health: Readonly<{ state: BrowserProviderHealthState; checkedAt: string; reasonCode?: string }>
  readOnlyInspection: true
  productionExecutionEnabled: false
  maximumConcurrentWork: 0
  executionDependencies: readonly never[]
  capabilityCount: number
  capabilities: readonly BrowserProviderPolicyReviewCapability[]
}

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

export function createBrowserProviderPolicyReviewSnapshot(adapter: BrowserProviderAdapter): BrowserProviderPolicyReviewSnapshot {
  const worker = createBrowserProviderWorkerDescriptor(adapter)
  const version = adapter.getVersion()

  if (!adapter.supportsReadOnlyInspection() || adapter.supportsProduction() || worker.maximumConcurrentWork !== 0 || worker.executionDependencies.length !== 0) {
    throw new BrowserProviderError('invalid_provider')
  }

  const capabilities = adapter.capabilities
    .map(capability => {
      const mapped = mapBrowserProviderCapabilityToSupervisorCapability(capability)
      if (!capability.readOnly || mapped.allowedEnvironments.includes('production')) {
        throw new BrowserProviderError('invalid_provider')
      }

      return Object.freeze({
        capabilityId: capability.capabilityId,
        displayNameKey: capability.displayNameKey,
        descriptionKey: capability.descriptionKey,
        operation: capability.operation,
        riskClass: capability.riskClass,
        maturity: capability.maturity,
        readOnly: true as const,
        channels: Object.freeze({ ...mapped.channels, manual: true as const }),
        requiresHumanApproval: capability.requiresHumanApproval,
        supportsAutoFailover: capability.supportsAutoFailover,
        supportsBrowserOnDemand: capability.supportsBrowserOnDemand,
        reversible: capability.reversible,
        idempotent: capability.idempotent,
        approvedOriginIds: Object.freeze([...mapped.approvedOrigins].sort()),
        allowedEnvironments: Object.freeze(['sandbox', 'preview'] as const),
        navigationProfileId: capability.navigationProfileId,
        verificationProfileId: capability.verificationProfileId,
        evidenceProfileId: capability.evidenceProfileId,
        policyVersion: mapped.policyVersion,
        capabilityVersion: capability.capabilityVersion,
      })
    })
    .sort((left, right) => left.capabilityId.localeCompare(right.capabilityId))

  return Object.freeze({
    providerId: adapter.providerId,
    displayNameKey: adapter.displayNameKey,
    adapterVersion: adapter.adapterVersion,
    capabilityVersion: version.capabilityVersion,
    schemaVersion: adapter.schemaVersion,
    health: Object.freeze({
      state: adapter.health.state,
      checkedAt: adapter.health.checkedAt,
      ...(adapter.health.reasonCode ? { reasonCode: adapter.health.reasonCode } : {}),
    }),
    readOnlyInspection: true as const,
    productionExecutionEnabled: false as const,
    maximumConcurrentWork: 0 as const,
    executionDependencies: Object.freeze([]) as readonly never[],
    capabilityCount: capabilities.length,
    capabilities: Object.freeze(capabilities),
  })
}
