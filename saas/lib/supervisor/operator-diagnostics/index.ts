import type { BrowserProviderDiagnosticsSnapshot } from '../../browser-provider/provider-diagnostics.ts'
import type { ProviderAlertHistorySnapshot } from '../provider-alert-history/index.ts'
import type { ProviderReliabilityForecastSnapshot } from '../provider-reliability-forecast/index.ts'
import type { SupervisorReconciliationReport } from '../coordination/startup-reconciliation.ts'
import type { Lease, SupervisorInstance, WorkItem } from '../coordination/index.ts'

export const SUPERVISOR_OPERATOR_DIAGNOSTICS_SCHEMA_VERSION = 'supervisor-operator-diagnostics-v1' as const

type DiagnosticState = 'healthy' | 'warning' | 'critical' | 'unknown'

export interface SupervisorOperatorDiagnosticsInput {
  generatedAt: string
  instances: readonly SupervisorInstance[]
  workItems: readonly WorkItem[]
  leases: readonly Lease[]
  alertHistory: ProviderAlertHistorySnapshot
  reliabilityForecast: ProviderReliabilityForecastSnapshot
  browserProviders: BrowserProviderDiagnosticsSnapshot
  reconciliationReports?: readonly SupervisorReconciliationReport[]
  staleOwnerRejections?: number
}

export interface SupervisorOperatorDiagnosticsSnapshot {
  generatedAt: string
  status: DiagnosticState
  summary: {
    activeInstances: number
    activeLeases: number
    queuedWork: number
    pausedForApproval: number
    activeAlerts: number
    highRiskProviders: number
    criticalRiskProviders: number
    staleOwnerRejections: number
    reconciliationRuns: number
  }
  cluster: readonly {
    instanceId: string
    runtimeId: string
    status: SupervisorInstance['status']
    heartbeatAt: string
    activeLeaseCount: number
    ownedWorkItemIds: readonly string[]
  }[]
  queue: readonly {
    workItemId: string
    provider: string
    environment: WorkItem['environment']
    state: WorkItem['state']
    priority: number
    attempt: number
    maxAttempts: number
    executionId?: string
    leaseId?: string
    fencingToken?: number
  }[]
  providers: readonly {
    provider: string
    trend: string
    riskLevel: string
    stabilityScore: number
    confidenceScore: number
    activeAlerts: number
    alertOccurrences: number
  }[]
  alerts: readonly {
    historyId: string
    alertId: string
    provider: string
    type: string
    status: string
    escalationCount: number
    deescalationCount: number
    lastObservedAt: string
  }[]
  reconciliation: readonly {
    startedAt: string
    completedAt: string
    reconciledWorkItemCount: number
    invalidatedApprovalCount: number
  }[]
  browserProviderMetadata: readonly {
    providerId: string
    adapterVersion: string
    health: string
    capabilityCount: number
    readOnlyInspection: boolean
    productionExecutionEnabled: false
    maximumConcurrentWork: 0
  }[]
  safety: {
    readOnly: true
    productionBrowserExecutionEnabled: false
    providerMutationEnabled: false
    automaticProductionRepairEnabled: false
  }
  schemaVersion: typeof SUPERVISOR_OPERATOR_DIAGNOSTICS_SCHEMA_VERSION
}

const terminalStates = new Set<WorkItem['state']>(['completed', 'failed', 'blocked', 'expired', 'abandoned'])
const MAX_QUEUE = 100
const MAX_ALERTS = 100
const MAX_RECONCILIATION = 50

function validateTimestamp(value: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`invalid_operator_diagnostics_timestamp:${value}`)
}

function overallState(input: SupervisorOperatorDiagnosticsInput): DiagnosticState {
  if (input.reliabilityForecast.summary.criticalRisk > 0) return 'critical'
  if (input.instances.some(instance => instance.status === 'unavailable')) return 'critical'
  if (input.reliabilityForecast.summary.highRisk > 0 || input.alertHistory.summary.active > 0) return 'warning'
  if (input.instances.length === 0) return 'unknown'
  return 'healthy'
}

export function createSupervisorOperatorDiagnostics(
  input: SupervisorOperatorDiagnosticsInput,
): SupervisorOperatorDiagnosticsSnapshot {
  validateTimestamp(input.generatedAt)
  if (input.browserProviders.productionExecutionEnabled !== false) {
    throw new Error('operator_diagnostics_production_browser_execution_forbidden')
  }

  const activeLeases = input.leases
    .filter(lease => Date.parse(lease.expiresAt) > Date.parse(input.generatedAt))
    .sort((a, b) => a.workItemId.localeCompare(b.workItemId))

  const cluster = input.instances
    .map(instance => {
      const owned = activeLeases.filter(lease =>
        lease.ownerInstanceId === instance.instanceId && lease.ownerRuntimeId === instance.runtimeId)
      return {
        instanceId: instance.instanceId,
        runtimeId: instance.runtimeId,
        status: instance.status,
        heartbeatAt: instance.heartbeatAt,
        activeLeaseCount: owned.length,
        ownedWorkItemIds: owned.map(lease => lease.workItemId).sort((a, b) => a.localeCompare(b)),
      }
    })
    .sort((a, b) => a.instanceId.localeCompare(b.instanceId) || a.runtimeId.localeCompare(b.runtimeId))

  const leaseByWorkItem = new Map(activeLeases.map(lease => [lease.workItemId, lease]))
  const queue = input.workItems
    .filter(item => !terminalStates.has(item.state))
    .sort((a, b) => b.priority - a.priority || a.availableAt.localeCompare(b.availableAt) || a.workItemId.localeCompare(b.workItemId))
    .slice(0, MAX_QUEUE)
    .map(item => {
      const lease = leaseByWorkItem.get(item.workItemId)
      return {
        workItemId: item.workItemId,
        provider: item.provider,
        environment: item.environment,
        state: item.state,
        priority: item.priority,
        attempt: item.attempt,
        maxAttempts: item.maxAttempts,
        executionId: item.executionId,
        leaseId: lease?.leaseId,
        fencingToken: lease?.fencingToken,
      }
    })

  const providers = input.reliabilityForecast.forecasts.map(item => ({ ...item }))
  const alerts = input.alertHistory.records.slice(0, MAX_ALERTS).map(record => ({
    historyId: record.historyId,
    alertId: record.alertId,
    provider: record.provider,
    type: record.type,
    status: record.status,
    escalationCount: record.escalationCount,
    deescalationCount: record.deescalationCount,
    lastObservedAt: record.lastObservedAt,
  }))

  const reconciliation = [...(input.reconciliationReports ?? [])]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, MAX_RECONCILIATION)
    .map(report => ({
      startedAt: report.startedAt,
      completedAt: report.completedAt,
      reconciledWorkItemCount: report.reconciledWorkItemIds.length,
      invalidatedApprovalCount: report.invalidatedExecutionIds.length,
    }))

  const browserProviderMetadata = input.browserProviders.providers
    .map(provider => ({
      providerId: provider.providerId,
      adapterVersion: provider.adapterVersion,
      health: provider.health.state,
      capabilityCount: provider.capabilities.length,
      readOnlyInspection: provider.support.readOnlyInspection,
      productionExecutionEnabled: false as const,
      maximumConcurrentWork: 0 as const,
    }))
    .sort((a, b) => a.providerId.localeCompare(b.providerId))

  return Object.freeze({
    generatedAt: input.generatedAt,
    status: overallState(input),
    summary: {
      activeInstances: input.instances.filter(instance => ['starting', 'healthy', 'draining'].includes(instance.status)).length,
      activeLeases: activeLeases.length,
      queuedWork: queue.filter(item => item.state === 'queued').length,
      pausedForApproval: queue.filter(item => item.state === 'paused_for_approval').length,
      activeAlerts: input.alertHistory.summary.active,
      highRiskProviders: input.reliabilityForecast.summary.highRisk,
      criticalRiskProviders: input.reliabilityForecast.summary.criticalRisk,
      staleOwnerRejections: Math.max(0, Math.floor(input.staleOwnerRejections ?? 0)),
      reconciliationRuns: reconciliation.length,
    },
    cluster,
    queue,
    providers,
    alerts,
    reconciliation,
    browserProviderMetadata,
    safety: {
      readOnly: true as const,
      productionBrowserExecutionEnabled: false as const,
      providerMutationEnabled: false as const,
      automaticProductionRepairEnabled: false as const,
    },
    schemaVersion: SUPERVISOR_OPERATOR_DIAGNOSTICS_SCHEMA_VERSION,
  })
}
