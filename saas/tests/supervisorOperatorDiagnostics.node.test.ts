import assert from 'node:assert/strict'
import test from 'node:test'
import { createSupervisorOperatorDiagnostics } from '../lib/supervisor/operator-diagnostics/index.ts'

const at = '2026-07-18T12:00:00.000Z'

function input() {
  return {
    generatedAt: at,
    instances: [{
      instanceId: 'supervisor-a', runtimeId: 'runtime-1', startedAt: at, heartbeatAt: at,
      softwareVersion: '1', schemaVersion: 'supervisor-instance-v1', supportedProviderKinds: ['vercel'], status: 'healthy',
    }],
    workItems: [
      { workItemId: 'work-queued', workItemType: 'observe', incidentId: 'incident-1', provider: 'vercel', environment: 'sandbox', state: 'queued', priority: 5, createdAt: at, availableAt: at, attempt: 0, maxAttempts: 3, policyVersion: 'policy-v1', schemaVersion: 'work-v1' },
      { workItemId: 'work-paused', workItemType: 'browser', incidentId: 'incident-2', executionId: 'exec-2', provider: 'vercel', environment: 'sandbox', state: 'paused_for_approval', priority: 9, createdAt: at, availableAt: at, attempt: 1, maxAttempts: 2, policyVersion: 'policy-v1', schemaVersion: 'work-v1' },
    ],
    leases: [{ leaseId: 'lease-1', workItemId: 'work-paused', ownerInstanceId: 'supervisor-a', ownerRuntimeId: 'runtime-1', fencingToken: 2, acquiredAt: at, heartbeatAt: at, expiresAt: '2026-07-18T12:05:00.000Z', policyVersion: 'policy-v1', schemaVersion: 'supervisor-lease-v1' }],
    alertHistory: {
      generatedAt: at,
      summary: { total: 1, active: 1, resolved: 0, providers: 1, escalations: 1, deescalations: 0 },
      records: [{ historyId: 'alert-1:1', alertId: 'alert-1', provider: 'vercel', type: 'provider_failure', occurrence: 1, firstOpenedAt: at, lastObservedAt: at, escalationCount: 1, deescalationCount: 0, resolvedAt: null, totalActiveDurationMs: 0, status: 'active' }],
      providerTrends: [], schemaVersion: 'supervisor-provider-alert-history-v1',
    },
    reliabilityForecast: {
      generatedAt: at,
      summary: { total: 1, improving: 0, stable: 0, degrading: 1, highRisk: 1, criticalRisk: 0 },
      forecasts: [{ provider: 'vercel', trend: 'degrading', riskLevel: 'high', recurrenceScore: 60, stabilityScore: 40, confidenceScore: 80, activeAlerts: 1, alertOccurrences: 3, lastObservedAt: at }],
      schemaVersion: 'supervisor-provider-reliability-forecast-v1',
    },
    browserProviders: {
      schemaVersion: 'browser-provider-diagnostics-v1', productionExecutionEnabled: false,
      providers: [{ providerId: 'vercel', displayNameKey: 'vercel', adapterVersion: '1', schemaVersion: '1', health: { state: 'healthy', checkedAt: at }, version: { adapterVersion: '1', capabilityVersion: '1', schemaVersion: '1' }, support: { readOnlyInspection: true, sandboxMetadata: true, autoFailoverEnabled: false, browserOnDemandEnabled: false, productionExecutionEnabled: false }, worker: { providerKind: 'vercel', supportedWorkItemTypes: [], supportedCapabilities: [], adapterVersion: '1', health: 'healthy', maximumConcurrentWork: 0, executionDependencies: [] }, origins: [], capabilities: [] }],
    },
    reconciliationReports: [{ startedAt: at, completedAt: at, reconciledWorkItemIds: ['work-paused'], invalidatedExecutionIds: ['exec-2'], schemaVersion: 'supervisor-startup-reconciliation-v1' }],
    staleOwnerRejections: 2,
  } as const
}

test('creates a deterministic read-only operator diagnostics snapshot', () => {
  const first = createSupervisorOperatorDiagnostics(input() as any)
  const second = createSupervisorOperatorDiagnostics(input() as any)
  assert.deepEqual(first, second)
  assert.equal(first.schemaVersion, 'supervisor-operator-diagnostics-v1')
  assert.equal(first.status, 'warning')
  assert.equal(first.summary.activeInstances, 1)
  assert.equal(first.summary.activeLeases, 1)
  assert.equal(first.summary.queuedWork, 1)
  assert.equal(first.summary.pausedForApproval, 1)
  assert.equal(first.summary.staleOwnerRejections, 2)
  assert.equal(first.cluster[0]?.activeLeaseCount, 1)
  assert.equal(first.queue[0]?.workItemId, 'work-paused')
  assert.equal(first.queue[0]?.fencingToken, 2)
  assert.equal(first.reconciliation[0]?.invalidatedApprovalCount, 1)
  assert.equal(first.browserProviderMetadata[0]?.maximumConcurrentWork, 0)
  assert.deepEqual(first.safety, { readOnly: true, productionBrowserExecutionEnabled: false, providerMutationEnabled: false, automaticProductionRepairEnabled: false })
})

test('returns unknown for an empty cluster and critical for critical provider risk', () => {
  const empty = input() as any
  empty.instances = []
  empty.alertHistory = { ...empty.alertHistory, summary: { ...empty.alertHistory.summary, active: 0 }, records: [] }
  empty.reliabilityForecast = { ...empty.reliabilityForecast, summary: { ...empty.reliabilityForecast.summary, highRisk: 0 }, forecasts: [] }
  assert.equal(createSupervisorOperatorDiagnostics(empty).status, 'unknown')

  const critical = input() as any
  critical.reliabilityForecast = { ...critical.reliabilityForecast, summary: { ...critical.reliabilityForecast.summary, highRisk: 0, criticalRisk: 1 } }
  assert.equal(createSupervisorOperatorDiagnostics(critical).status, 'critical')
})

test('fails closed if production browser execution is enabled', () => {
  const unsafe = input() as any
  unsafe.browserProviders = { ...unsafe.browserProviders, productionExecutionEnabled: true }
  assert.throws(() => createSupervisorOperatorDiagnostics(unsafe), /production_browser_execution_forbidden/)
})
