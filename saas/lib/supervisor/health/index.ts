import type { Lease, SupervisorInstance } from '../coordination/index.ts'

export const supervisorHealthStatuses = ['healthy', 'degraded', 'critical'] as const
export type SupervisorHealthStatus = typeof supervisorHealthStatuses[number]

export interface ProviderRegistrationSnapshot {
  provider: string
  registered: boolean
  enabled?: boolean
}

export interface SupervisorHealthThresholds {
  heartbeatStaleMs: number
  leaseHeartbeatStaleMs: number
}

export interface SupervisorHealthInput {
  instances: SupervisorInstance[]
  activeLeases: Lease[]
  providers: ProviderRegistrationSnapshot[]
  expectedProviders: string[]
  now?: Date
  thresholds?: Partial<SupervisorHealthThresholds>
}

export interface SupervisorHealthIssue {
  code: 'no_healthy_instances' | 'stale_heartbeat' | 'stale_lease' | 'missing_provider_registration'
  severity: 'warning' | 'critical'
  subject: string
  ageMs?: number
}

export interface SupervisorHealthReport {
  status: SupervisorHealthStatus
  score: number
  checkedAt: string
  totals: {
    instances: number
    healthyInstances: number
    staleHeartbeats: number
    activeLeases: number
    staleLeases: number
    missingProviders: number
  }
  issues: SupervisorHealthIssue[]
  schemaVersion: 'supervisor-health-v1'
}

const defaults: SupervisorHealthThresholds = {
  heartbeatStaleMs: 90_000,
  leaseHeartbeatStaleMs: 60_000,
}

const age = (value: string, now: number) => {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? Math.max(0, now - parsed) : Number.POSITIVE_INFINITY
}

export function evaluateSupervisorHealth(input: SupervisorHealthInput): SupervisorHealthReport {
  const now = input.now ?? new Date()
  const nowMs = now.getTime()
  const thresholds = { ...defaults, ...input.thresholds }
  const issues: SupervisorHealthIssue[] = []

  const healthyInstances = input.instances.filter(instance => {
    const heartbeatAge = age(instance.heartbeatAt, nowMs)
    const healthy = instance.status === 'healthy' && heartbeatAge <= thresholds.heartbeatStaleMs
    if (instance.status === 'healthy' && !healthy) {
      issues.push({ code: 'stale_heartbeat', severity: 'critical', subject: `${instance.instanceId}:${instance.runtimeId}`, ageMs: heartbeatAge })
    }
    return healthy
  })

  if (healthyInstances.length === 0) {
    issues.unshift({ code: 'no_healthy_instances', severity: 'critical', subject: 'supervisor-fleet' })
  }

  for (const lease of input.activeLeases) {
    const heartbeatAge = age(lease.heartbeatAt, nowMs)
    const expired = Date.parse(lease.expiresAt) <= nowMs
    if (expired || heartbeatAge > thresholds.leaseHeartbeatStaleMs) {
      issues.push({ code: 'stale_lease', severity: 'critical', subject: lease.workItemId, ageMs: heartbeatAge })
    }
  }

  const registered = new Set(input.providers.filter(provider => provider.registered && provider.enabled !== false).map(provider => provider.provider))
  for (const provider of new Set(input.expectedProviders)) {
    if (!registered.has(provider)) issues.push({ code: 'missing_provider_registration', severity: 'warning', subject: provider })
  }

  const critical = issues.filter(issue => issue.severity === 'critical').length
  const warnings = issues.length - critical
  let score = Math.max(0, 100 - (critical * 25) - (warnings * 10))
  let status: SupervisorHealthStatus = critical > 0 ? 'critical' : warnings > 0 ? 'degraded' : 'healthy'
  if (healthyInstances.length === 0) {
    status = 'critical'
    score = 0
  }

  return {
    status,
    score,
    checkedAt: now.toISOString(),
    totals: {
      instances: input.instances.length,
      healthyInstances: healthyInstances.length,
      staleHeartbeats: issues.filter(issue => issue.code === 'stale_heartbeat').length,
      activeLeases: input.activeLeases.length,
      staleLeases: issues.filter(issue => issue.code === 'stale_lease').length,
      missingProviders: issues.filter(issue => issue.code === 'missing_provider_registration').length,
    },
    issues,
    schemaVersion: 'supervisor-health-v1',
  }
}
