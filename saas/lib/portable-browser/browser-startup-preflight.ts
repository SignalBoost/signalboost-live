import type { PortableBrowserHostCapabilities } from './browser-host-capabilities.ts'
import type { PortableBrowserBuyerConfiguration } from './browser-buyer-configuration.ts'

export const PORTABLE_BROWSER_PREFLIGHT_SCHEMA_VERSION = '1.0.0' as const

export interface PortableBrowserStartupPreflightInput {
  readonly configuration: PortableBrowserBuyerConfiguration
  readonly host: PortableBrowserHostCapabilities
  readonly registeredProviderIds: readonly string[]
}

export interface PortableBrowserStartupPreflightResult {
  readonly schemaVersion: typeof PORTABLE_BROWSER_PREFLIGHT_SCHEMA_VERSION
  readonly ready: boolean
  readonly providerId: string
  readonly checks: readonly Readonly<{
    id: string
    passed: boolean
    required: true
    reason?: string
  }>[]
  readonly errors: readonly string[]
}

function freeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const nested of Object.values(value as Record<string, unknown>)) freeze(nested)
  return value
}

function validIds(values: readonly string[], code: string): readonly string[] {
  if (!Array.isArray(values) || values.length > 256) throw new Error(code)
  const normalized = values.map(value => {
    if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(value)) throw new Error(code)
    return value
  })
  if (new Set(normalized).size !== normalized.length) throw new Error(`${code}_duplicate`)
  return Object.freeze([...normalized].sort())
}

export function runPortableBrowserStartupPreflight(input: PortableBrowserStartupPreflightInput): PortableBrowserStartupPreflightResult {
  if (!input?.configuration) throw new Error('portable_browser_preflight_configuration_required')
  if (!input.host) throw new Error('portable_browser_preflight_host_required')

  const providers = validIds(input.registeredProviderIds, 'portable_browser_preflight_provider_registry_invalid')
  const checks: Array<{ id: string; passed: boolean; required: true; reason?: string }> = []
  const add = (id: string, passed: boolean, reason?: string) => checks.push(Object.freeze({ id, passed, required: true as const, ...(passed || !reason ? {} : { reason }) }))

  add('provider_registered', providers.includes(input.configuration.providerId), 'provider_not_registered')
  add('host_production_disabled', input.host.productionEnabled === false, 'host_production_execution_enabled')
  add('configuration_production_disabled', input.configuration.security.productionExecutionEnabled === false, 'configuration_production_execution_enabled')
  add('execute_change_disabled', input.configuration.security.executeChangeEnabled === false, 'execute_change_enabled')
  add('buyer_managed_credentials', input.configuration.security.buyerManagedCredentials === true, 'buyer_managed_credentials_required')
  add('approval_preserved', input.configuration.security.requireApproval === true, 'approval_required')
  add('session_capacity_supported', input.host.maximumConcurrentSessions >= input.configuration.lifecycle.maxConcurrentSessions, 'host_session_capacity_insufficient')
  add('session_duration_supported', input.host.maximumSessionDurationMs >= input.configuration.lifecycle.maxSessionAgeMs, 'host_session_duration_insufficient')
  add('deployment_environment_supported', input.host.environments.includes(input.configuration.deploymentMode === 'local' ? 'local' : 'sandbox'), 'deployment_environment_unsupported')
  add('session_port_available', input.host.ports.includes('session'), 'session_port_unavailable')

  const errors = Object.freeze(checks.filter(check => !check.passed).map(check => check.reason!).sort())
  return freeze({
    schemaVersion: PORTABLE_BROWSER_PREFLIGHT_SCHEMA_VERSION,
    ready: errors.length === 0,
    providerId: input.configuration.providerId,
    checks: Object.freeze([...checks].sort((a, b) => a.id.localeCompare(b.id))),
    errors,
  })
}
