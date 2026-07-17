import {
  createBrowserProviderDiagnosticsSnapshot,
  createDefaultBrowserProviderRegistry,
  mapBrowserProviderCapabilityToSupervisorCapability,
  type BrowserProviderRegistry,
} from '../browser-provider/index.ts'
import {
  ExecutionChannelSelector,
  StaticCapabilityRegistry,
  type ExecutionDecision,
  type SelectInput,
} from './execution-policy/index.ts'
import {
  createBrowserProviderSelectionAuditEvent,
  explainBrowserProviderSelection,
  BrowserProviderSelectionAuditError,
  type BrowserProviderSelectionExplanation,
} from './browser-provider-selection-audit.ts'
import type {
  ExecutionRecordStore,
  PersistentAuditEvent,
} from './persistence/index.ts'

export interface SelectBrowserProviderExecutionWithAuditInput extends SelectInput {
  readonly incidentId: string
  readonly providerId: string
  readonly executionId?: string
  readonly dispatchId?: string
}

export interface BrowserProviderAuditedSelectorDependencies {
  readonly auditStore: Pick<ExecutionRecordStore, 'appendAuditEvent'>
  readonly providerRegistry?: BrowserProviderRegistry
  readonly activePolicyVersion?: string
}

export interface BrowserProviderAuditedSelection {
  readonly decision: Readonly<ExecutionDecision>
  readonly explanation: BrowserProviderSelectionExplanation
  readonly auditEvent: Readonly<PersistentAuditEvent>
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const nested of Object.values(value as unknown as Record<string, unknown>)) {
      deepFreeze(nested)
    }
  }
  return value
}

function requireIdentity(value: string, field: string): string {
  if (!value.trim()) {
    throw new BrowserProviderSelectionAuditError('invalid_audit_identity', `${field} is required`)
  }
  return value
}

function detachDecision(decision: ExecutionDecision): Readonly<ExecutionDecision> {
  return deepFreeze(structuredClone(decision))
}

function toSelectionInput(input: SelectBrowserProviderExecutionWithAuditInput): SelectInput {
  return {
    workItemId: input.workItemId,
    executionMode: input.executionMode,
    capabilityId: input.capabilityId,
    capabilityVersion: input.capabilityVersion,
    environment: input.environment,
    apiAttempted: input.apiAttempted,
    apiFailureCategory: input.apiFailureCategory,
    retryCount: input.retryCount,
    maxRetries: input.maxRetries,
    browserReason: input.browserReason ? structuredClone(input.browserReason) : undefined,
    ownerInstanceId: input.ownerInstanceId,
    ownerRuntimeId: input.ownerRuntimeId,
    fencingToken: input.fencingToken,
    now: new Date(input.now.getTime()),
    decisionTtlMs: input.decisionTtlMs,
    flags: input.flags ? { ...input.flags } : undefined,
  }
}

/**
 * Canonical governed selection boundary for BPAL-backed Supervisor decisions.
 *
 * The function selects from capabilities registered by one exact BPAL provider,
 * validates the resulting decision against the same detached diagnostics
 * snapshot, and persists the metadata-only explanation before returning.
 * It has no provider client, Browser Runtime, credential, approval, or mutation
 * dependency. Audit persistence failure is terminal and no unaudited decision is
 * returned to the caller.
 */
export async function selectBrowserProviderExecutionWithAudit(
  dependencies: BrowserProviderAuditedSelectorDependencies,
  input: SelectBrowserProviderExecutionWithAuditInput,
): Promise<BrowserProviderAuditedSelection> {
  const incidentId = requireIdentity(input.incidentId, 'incidentId')
  const providerId = requireIdentity(input.providerId, 'providerId')
  const registry = dependencies.providerRegistry ?? createDefaultBrowserProviderRegistry()
  const provider = registry.get(providerId)

  const providerCapability = provider.capabilities.find(capability => (
    capability.capabilityId === input.capabilityId
    && (!input.capabilityVersion || capability.capabilityVersion === input.capabilityVersion)
  ))
  if (!providerCapability) {
    throw new BrowserProviderSelectionAuditError('unknown_capability')
  }

  const supervisorCapabilities = provider.capabilities.map(
    mapBrowserProviderCapabilityToSupervisorCapability,
  )
  const selector = new ExecutionChannelSelector(
    new StaticCapabilityRegistry(supervisorCapabilities),
    dependencies.activePolicyVersion ?? 'ha-policy-v1',
  )

  const decision = detachDecision(selector.select(toSelectionInput(input)))
  const diagnosticsSnapshot = createBrowserProviderDiagnosticsSnapshot(registry)
  const explanation = explainBrowserProviderSelection({
    providerId,
    decision,
    diagnosticsSnapshot,
  })
  const auditEvent = createBrowserProviderSelectionAuditEvent({
    incidentId,
    providerId,
    decision,
    executionId: input.executionId,
    dispatchId: input.dispatchId,
    diagnosticsSnapshot,
  })

  await dependencies.auditStore.appendAuditEvent(auditEvent)

  return deepFreeze({ decision, explanation, auditEvent })
}
