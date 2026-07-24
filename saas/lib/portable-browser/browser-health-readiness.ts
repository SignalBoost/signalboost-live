import type { PortableBrowserLifecycleHealthSnapshot } from './browser-session-lifecycle-manager.ts'

export const PORTABLE_BROWSER_HEALTH_SCHEMA_VERSION = '1.0.0' as const

export type PortableBrowserComponentStatus = 'healthy' | 'degraded' | 'unavailable'
export type PortableBrowserReadinessStatus = 'ready' | 'not_ready'

export interface PortableBrowserComponentProbe {
  readonly componentId: string
  readonly required: boolean
  readonly status: PortableBrowserComponentStatus
  readonly checkedAt: number
  readonly latencyMs?: number
  readonly message?: string
}

export interface PortableBrowserHealthReadinessInput {
  readonly generatedAt: number
  readonly configurationValid: boolean
  readonly lifecycle: PortableBrowserLifecycleHealthSnapshot
  readonly components: readonly PortableBrowserComponentProbe[]
}

export interface PortableBrowserHealthReadinessSnapshot {
  readonly schemaVersion: typeof PORTABLE_BROWSER_HEALTH_SCHEMA_VERSION
  readonly generatedAt: number
  readonly health: PortableBrowserComponentStatus
  readonly readiness: PortableBrowserReadinessStatus
  readonly configurationValid: boolean
  readonly lifecycle: PortableBrowserLifecycleHealthSnapshot
  readonly components: readonly PortableBrowserComponentProbe[]
  readonly reasons: readonly string[]
}

function requireTimestamp(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('portable_browser_health_timestamp_invalid')
  return value
}

function requireComponentId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(value)) {
    throw new Error('portable_browser_health_component_id_invalid')
  }
  return value
}

function safeMessage(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length === 0) throw new Error('portable_browser_health_message_invalid')
  return value
    .replace(/(?:token|secret|password|api[-_ ]?key)\s*[=:]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/[\r\n\0]/g, ' ')
    .slice(0, 256)
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested)
  return value
}

function normalizeProbe(probe: PortableBrowserComponentProbe): PortableBrowserComponentProbe {
  const latencyMs = probe.latencyMs
  if (latencyMs !== undefined && (!Number.isFinite(latencyMs) || latencyMs < 0 || latencyMs > 300_000)) {
    throw new Error('portable_browser_health_latency_invalid')
  }
  if (!['healthy', 'degraded', 'unavailable'].includes(probe.status)) {
    throw new Error('portable_browser_health_status_invalid')
  }
  return Object.freeze({
    componentId: requireComponentId(probe.componentId),
    required: probe.required === true,
    status: probe.status,
    checkedAt: requireTimestamp(probe.checkedAt),
    ...(latencyMs === undefined ? {} : { latencyMs }),
    ...(probe.message === undefined ? {} : { message: safeMessage(probe.message) }),
  })
}

export function buildPortableBrowserHealthReadinessSnapshot(
  input: PortableBrowserHealthReadinessInput,
): PortableBrowserHealthReadinessSnapshot {
  const generatedAt = requireTimestamp(input.generatedAt)
  if (!input.lifecycle || !['healthy', 'degraded'].includes(input.lifecycle.status)) {
    throw new Error('portable_browser_lifecycle_health_invalid')
  }
  if (!Array.isArray(input.components) || input.components.length > 128) {
    throw new Error('portable_browser_health_components_invalid')
  }

  const components = input.components.map(normalizeProbe)
    .sort((a, b) => a.componentId.localeCompare(b.componentId))
  if (new Set(components.map(component => component.componentId)).size !== components.length) {
    throw new Error('portable_browser_health_duplicate_component')
  }
  if (components.some(component => component.checkedAt > generatedAt)) {
    throw new Error('portable_browser_health_future_probe_rejected')
  }

  const reasons: string[] = []
  if (!input.configurationValid) reasons.push('configuration_invalid')
  if (input.lifecycle.status === 'degraded') reasons.push('lifecycle_degraded')
  for (const component of components) {
    if (component.required && component.status !== 'healthy') {
      reasons.push(`required_component_${component.status}:${component.componentId}`)
    } else if (!component.required && component.status === 'unavailable') {
      reasons.push(`optional_component_unavailable:${component.componentId}`)
    }
  }

  const requiredUnavailable = components.some(component => component.required && component.status === 'unavailable')
  const requiredDegraded = components.some(component => component.required && component.status === 'degraded')
  const readiness: PortableBrowserReadinessStatus = input.configurationValid
    && input.lifecycle.status === 'healthy'
    && !requiredUnavailable
    && !requiredDegraded
    ? 'ready'
    : 'not_ready'
  const health: PortableBrowserComponentStatus = requiredUnavailable
    ? 'unavailable'
    : input.lifecycle.status === 'degraded' || requiredDegraded || components.some(component => component.status !== 'healthy')
      ? 'degraded'
      : 'healthy'

  return deepFreeze({
    schemaVersion: PORTABLE_BROWSER_HEALTH_SCHEMA_VERSION,
    generatedAt,
    health,
    readiness,
    configurationValid: input.configurationValid === true,
    lifecycle: input.lifecycle,
    components,
    reasons: [...new Set(reasons)].sort(),
  })
}
