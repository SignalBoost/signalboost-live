import {
  BROWSER_PROVIDER_DIAGNOSTICS_SCHEMA_VERSION,
  createBrowserProviderDiagnosticsSnapshot,
  type BrowserProviderCapabilityDiagnostics,
  type BrowserProviderDiagnostics,
  type BrowserProviderDiagnosticsSnapshot,
} from '../browser-provider/index.ts'
import type { SerializableValue } from './incident-schema.ts'
import type { ExecutionDecision } from './execution-policy/index.ts'
import {
  auditRecordSchemaVersion,
  parseAuditEvent,
  type PersistentAuditEvent,
} from './persistence/audit-record-schema.ts'

export const BROWSER_PROVIDER_SELECTION_EXPLANATION_SCHEMA_VERSION =
  'browser-provider-selection-explanation-v1' as const

export type BrowserProviderSelectionReasonCode =
  | 'api_channel_selected'
  | 'api_retry_selected'
  | 'browser_on_demand_selected'
  | 'browser_auto_failover_selected'
  | 'manual_operator_selected'
  | 'human_approval_required'
  | 'policy_blocked'
  | 'production_browser_execution_disabled'
  | 'read_only_capability'

export interface BrowserProviderSelectionExplanation {
  readonly schemaVersion: typeof BROWSER_PROVIDER_SELECTION_EXPLANATION_SCHEMA_VERSION
  readonly diagnosticsSchemaVersion: typeof BROWSER_PROVIDER_DIAGNOSTICS_SCHEMA_VERSION
  readonly decisionId: string
  readonly providerId: string
  readonly capabilityId: string
  readonly capabilityVersion: string
  readonly policyVersion: string
  readonly decisionCode: ExecutionDecision['decisionCode']
  readonly selectedChannel: ExecutionDecision['selectedChannel']
  readonly executionMode: ExecutionDecision['executionMode']
  readonly environment: string
  readonly riskClass: string
  readonly maturity: string
  readonly requiresHumanApproval: boolean
  readonly approvedStepIds: readonly string[]
  readonly originIds: readonly string[]
  readonly exactOrigins: readonly string[]
  readonly navigationProfileId: string | null
  readonly evidenceProfileId: string
  readonly verificationProfileId: string
  readonly apiFailureCategory: string | null
  readonly browserReason: string | null
  readonly reasonCodes: readonly BrowserProviderSelectionReasonCode[]
  readonly productionExecutionEnabled: false
}

export interface CreateBrowserProviderSelectionAuditEventInput {
  readonly incidentId: string
  readonly providerId: string
  readonly decision: ExecutionDecision
  readonly executionId?: string
  readonly dispatchId?: string
  readonly occurredAt?: string
  readonly diagnosticsSnapshot?: BrowserProviderDiagnosticsSnapshot
}

export class BrowserProviderSelectionAuditError extends Error {
  readonly code: string

  constructor(code: string, message: string = code) {
    super(message)
    this.name = 'BrowserProviderSelectionAuditError'
    this.code = code
  }
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

function requireString(value: string, field: string): string {
  if (!value.trim()) throw new BrowserProviderSelectionAuditError('invalid_audit_identity', `${field} is required`)
  return value
}

function findProvider(
  snapshot: BrowserProviderDiagnosticsSnapshot,
  providerId: string,
): BrowserProviderDiagnostics {
  const provider = snapshot.providers.find(candidate => candidate.providerId === providerId)
  if (!provider) throw new BrowserProviderSelectionAuditError('unknown_provider')
  return provider
}

function findCapability(
  provider: BrowserProviderDiagnostics,
  decision: ExecutionDecision,
): BrowserProviderCapabilityDiagnostics {
  const capability = provider.capabilities.find(candidate => candidate.capabilityId === decision.capabilityId)
  if (!capability) throw new BrowserProviderSelectionAuditError('unknown_capability')
  return capability
}

function validateDecisionChannel(decision: ExecutionDecision): void {
  const allowedCodes: Record<ExecutionDecision['selectedChannel'], readonly ExecutionDecision['decisionCode'][]> = {
    api: ['use_api', 'retry_api'],
    browser: ['use_browser_automatically', 'use_browser_with_guardrails'],
    manual: ['require_human_approval', 'use_manual_operator'],
    none: ['block'],
  }
  if (!allowedCodes[decision.selectedChannel].includes(decision.decisionCode)) {
    throw new BrowserProviderSelectionAuditError('decision_channel_mismatch')
  }
}

function validateDecisionBinding(
  provider: BrowserProviderDiagnostics,
  capability: BrowserProviderCapabilityDiagnostics,
  decision: ExecutionDecision,
): string {
  validateDecisionChannel(decision)
  if (
    provider.support.productionExecutionEnabled
    || capability.productionExecutionEnabled
    || decision.schemaVersion !== 'execution-channel-decision-v1'
    || capability.capabilityVersion !== decision.capabilityVersion
    || capability.policyVersion !== decision.policyVersion
    || capability.riskClass !== decision.riskClass
    || capability.maturity !== decision.maturity
    || capability.verificationProfileId !== decision.verificationProfileId
    || new Set(decision.approvedStepIds).size !== decision.approvedStepIds.length
  ) {
    throw new BrowserProviderSelectionAuditError('decision_binding_mismatch')
  }

  const environment = typeof decision.auditMetadata.environment === 'string'
    ? decision.auditMetadata.environment
    : ''
  if (!['sandbox', 'preview', 'production'].includes(environment)) {
    throw new BrowserProviderSelectionAuditError('environment_not_allowed')
  }
  if (
    (decision.selectedChannel === 'api' || decision.selectedChannel === 'browser')
    && !capability.allowedEnvironments.includes(environment)
  ) {
    throw new BrowserProviderSelectionAuditError('environment_not_allowed')
  }

  if (decision.selectedChannel === 'browser') {
    if (
      !capability.channels.browser
      || !capability.navigationProfileId
      || capability.allowedOriginIds.length === 0
    ) {
      throw new BrowserProviderSelectionAuditError('browser_selection_not_allowed')
    }
    if (decision.decisionCode === 'use_browser_automatically' && !capability.supportsAutoFailover) {
      throw new BrowserProviderSelectionAuditError('browser_auto_failover_not_allowed')
    }
    if (decision.decisionCode === 'use_browser_with_guardrails' && !capability.supportsBrowserOnDemand) {
      throw new BrowserProviderSelectionAuditError('browser_on_demand_not_allowed')
    }
  }

  if (decision.selectedChannel === 'api' && !capability.channels.api) {
    throw new BrowserProviderSelectionAuditError('api_selection_not_allowed')
  }
  if (decision.selectedChannel === 'manual' && !capability.channels.manual) {
    throw new BrowserProviderSelectionAuditError('manual_selection_not_allowed')
  }
  return environment
}

function reasonCodesFor(
  capability: BrowserProviderCapabilityDiagnostics,
  decision: ExecutionDecision,
): BrowserProviderSelectionReasonCode[] {
  const reasons: BrowserProviderSelectionReasonCode[] = []
  if (capability.readOnly) reasons.push('read_only_capability')
  if (decision.decisionCode === 'use_api') reasons.push('api_channel_selected')
  if (decision.decisionCode === 'retry_api') reasons.push('api_retry_selected')
  if (decision.decisionCode === 'use_browser_with_guardrails') reasons.push('browser_on_demand_selected')
  if (decision.decisionCode === 'use_browser_automatically') reasons.push('browser_auto_failover_selected')
  if (decision.decisionCode === 'use_manual_operator') reasons.push('manual_operator_selected')
  if (decision.decisionCode === 'require_human_approval' || decision.requiresHumanApproval) {
    reasons.push('human_approval_required')
  }
  if (decision.decisionCode === 'block') reasons.push('policy_blocked')
  reasons.push('production_browser_execution_disabled')
  return reasons
}

export function explainBrowserProviderSelection(
  input: Pick<CreateBrowserProviderSelectionAuditEventInput, 'providerId' | 'decision' | 'diagnosticsSnapshot'>,
): BrowserProviderSelectionExplanation {
  const snapshot = input.diagnosticsSnapshot ?? createBrowserProviderDiagnosticsSnapshot()
  if (
    snapshot.schemaVersion !== BROWSER_PROVIDER_DIAGNOSTICS_SCHEMA_VERSION
    || snapshot.productionExecutionEnabled
  ) {
    throw new BrowserProviderSelectionAuditError('invalid_diagnostics_snapshot')
  }

  const providerId = requireString(input.providerId, 'providerId')
  const provider = findProvider(snapshot, providerId)
  const capability = findCapability(provider, input.decision)
  const environment = validateDecisionBinding(provider, capability, input.decision)

  const exactOrigins = capability.allowedOriginIds.map(originId => {
    const origin = provider.origins.find(candidate => candidate.originId === originId)
    if (!origin) throw new BrowserProviderSelectionAuditError('unknown_origin')
    return origin.exactOrigin
  })

  return deepFreeze({
    schemaVersion: BROWSER_PROVIDER_SELECTION_EXPLANATION_SCHEMA_VERSION,
    diagnosticsSchemaVersion: snapshot.schemaVersion,
    decisionId: requireString(input.decision.decisionId, 'decisionId'),
    providerId,
    capabilityId: capability.capabilityId,
    capabilityVersion: capability.capabilityVersion,
    policyVersion: capability.policyVersion,
    decisionCode: input.decision.decisionCode,
    selectedChannel: input.decision.selectedChannel,
    executionMode: input.decision.executionMode,
    environment,
    riskClass: capability.riskClass,
    maturity: capability.maturity,
    requiresHumanApproval: input.decision.requiresHumanApproval,
    approvedStepIds: [...input.decision.approvedStepIds],
    originIds: [...capability.allowedOriginIds],
    exactOrigins,
    navigationProfileId: capability.navigationProfileId ?? null,
    evidenceProfileId: capability.evidenceProfileId,
    verificationProfileId: capability.verificationProfileId,
    apiFailureCategory: input.decision.apiFailureCategory ?? null,
    browserReason: input.decision.browserReason?.reason ?? null,
    reasonCodes: reasonCodesFor(capability, input.decision),
    productionExecutionEnabled: false as const,
  })
}

export function createBrowserProviderSelectionAuditEvent(
  input: CreateBrowserProviderSelectionAuditEventInput,
): Readonly<PersistentAuditEvent> {
  const explanation = explainBrowserProviderSelection(input)
  const occurredAt = input.occurredAt ?? input.decision.decidedAt
  const payload = explanation as unknown as Record<string, SerializableValue>
  const event = parseAuditEvent({
    eventId: `browser-provider-selection:${explanation.decisionId}`,
    executionId: input.executionId,
    dispatchId: input.dispatchId,
    incidentId: requireString(input.incidentId, 'incidentId'),
    eventType: 'browser_provider_capability_selection_explained',
    occurredAt,
    payload,
    schemaVersion: auditRecordSchemaVersion,
    createdAt: occurredAt,
  })
  return deepFreeze(event)
}
