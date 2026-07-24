export const PORTABLE_BROWSER_BUYER_CONFIGURATION_SCHEMA_VERSION = '1.0.0' as const

export type PortableBrowserDeploymentMode = 'local' | 'self_hosted' | 'customer_cloud' | 'managed_provider'
export type PortableBrowserTelemetryMode = 'disabled' | 'buyer_managed'
export type PortableBrowserEvidenceRetentionMode = 'none' | 'memory' | 'buyer_managed'

export interface PortableBrowserBuyerConfiguration {
  readonly schemaVersion: typeof PORTABLE_BROWSER_BUYER_CONFIGURATION_SCHEMA_VERSION
  readonly deploymentMode: PortableBrowserDeploymentMode
  readonly providerId: string
  readonly approvedOrigins: readonly string[]
  readonly lifecycle: Readonly<{
    maxConcurrentSessions: number
    maxSessionAgeMs: number
    cleanupBatchSize: number
  }>
  readonly security: Readonly<{
    productionExecutionEnabled: false
    executeChangeEnabled: false
    buyerManagedCredentials: true
    requireApproval: true
  }>
  readonly telemetry: Readonly<{
    mode: PortableBrowserTelemetryMode
    destinationRef?: string
  }>
  readonly evidence: Readonly<{
    retentionMode: PortableBrowserEvidenceRetentionMode
    destinationRef?: string
  }>
}

export interface PortableBrowserBuyerConfigurationValidationResult {
  readonly valid: boolean
  readonly errors: readonly string[]
  readonly configuration?: PortableBrowserBuyerConfiguration
}

export const portableBrowserBuyerConfigurationJsonSchema = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'urn:portable-browser:buyer-configuration:1.0.0',
  title: 'Portable Browser Buyer Configuration',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'deploymentMode', 'providerId', 'approvedOrigins', 'lifecycle', 'security', 'telemetry', 'evidence'],
  properties: Object.freeze({
    schemaVersion: Object.freeze({ const: PORTABLE_BROWSER_BUYER_CONFIGURATION_SCHEMA_VERSION }),
    deploymentMode: Object.freeze({ enum: Object.freeze(['local', 'self_hosted', 'customer_cloud', 'managed_provider']) }),
    providerId: Object.freeze({ type: 'string', minLength: 1, maxLength: 128 }),
    approvedOrigins: Object.freeze({ type: 'array', minItems: 1, maxItems: 128, uniqueItems: true, items: Object.freeze({ type: 'string', format: 'uri' }) }),
    lifecycle: Object.freeze({
      type: 'object',
      additionalProperties: false,
      required: Object.freeze(['maxConcurrentSessions', 'maxSessionAgeMs', 'cleanupBatchSize']),
      properties: Object.freeze({
        maxConcurrentSessions: Object.freeze({ type: 'integer', minimum: 1, maximum: 1000 }),
        maxSessionAgeMs: Object.freeze({ type: 'integer', minimum: 1000, maximum: 86400000 }),
        cleanupBatchSize: Object.freeze({ type: 'integer', minimum: 1, maximum: 1000 }),
      }),
    }),
    security: Object.freeze({
      type: 'object',
      additionalProperties: false,
      required: Object.freeze(['productionExecutionEnabled', 'executeChangeEnabled', 'buyerManagedCredentials', 'requireApproval']),
      properties: Object.freeze({
        productionExecutionEnabled: Object.freeze({ const: false }),
        executeChangeEnabled: Object.freeze({ const: false }),
        buyerManagedCredentials: Object.freeze({ const: true }),
        requireApproval: Object.freeze({ const: true }),
      }),
    }),
    telemetry: Object.freeze({
      type: 'object',
      additionalProperties: false,
      required: Object.freeze(['mode']),
      properties: Object.freeze({
        mode: Object.freeze({ enum: Object.freeze(['disabled', 'buyer_managed']) }),
        destinationRef: Object.freeze({ type: 'string', minLength: 1, maxLength: 512 }),
      }),
    }),
    evidence: Object.freeze({
      type: 'object',
      additionalProperties: false,
      required: Object.freeze(['retentionMode']),
      properties: Object.freeze({
        retentionMode: Object.freeze({ enum: Object.freeze(['none', 'memory', 'buyer_managed']) }),
        destinationRef: Object.freeze({ type: 'string', minLength: 1, maxLength: 512 }),
      }),
    }),
  }),
})

const DEPLOYMENT_MODES = new Set<PortableBrowserDeploymentMode>(['local', 'self_hosted', 'customer_cloud', 'managed_provider'])
const TELEMETRY_MODES = new Set<PortableBrowserTelemetryMode>(['disabled', 'buyer_managed'])
const EVIDENCE_MODES = new Set<PortableBrowserEvidenceRetentionMode>(['none', 'memory', 'buyer_managed'])
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed)
  return Object.keys(value).every(key => allowedKeys.has(key))
}

function validateInteger(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && (value as number) >= minimum && (value as number) <= maximum
}

function normalizeOrigin(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null
  try {
    const parsed = new URL(value)
    if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) return null
    if (parsed.origin !== value) return null
    return parsed.origin
  } catch {
    return null
  }
}

function validateReference(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === 'string' && value.length > 0 && value.length <= 512 && !/[\r\n\0]/.test(value))
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested)
  return value
}

export function validatePortableBrowserBuyerConfiguration(value: unknown): PortableBrowserBuyerConfigurationValidationResult {
  const errors: string[] = []
  if (!isRecord(value)) return Object.freeze({ valid: false, errors: Object.freeze(['configuration_object_required']) })

  if (!hasOnlyKeys(value, ['schemaVersion', 'deploymentMode', 'providerId', 'approvedOrigins', 'lifecycle', 'security', 'telemetry', 'evidence'])) {
    errors.push('unknown_configuration_field')
  }
  if (value.schemaVersion !== PORTABLE_BROWSER_BUYER_CONFIGURATION_SCHEMA_VERSION) errors.push('unsupported_schema_version')
  if (!DEPLOYMENT_MODES.has(value.deploymentMode as PortableBrowserDeploymentMode)) errors.push('deployment_mode_invalid')
  if (typeof value.providerId !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(value.providerId)) errors.push('provider_id_invalid')

  const approvedOrigins: string[] = []
  if (!Array.isArray(value.approvedOrigins) || value.approvedOrigins.length < 1 || value.approvedOrigins.length > 128) {
    errors.push('approved_origins_invalid')
  } else {
    for (const candidate of value.approvedOrigins) {
      const normalized = normalizeOrigin(candidate)
      if (!normalized) errors.push('approved_origin_invalid')
      else approvedOrigins.push(normalized)
    }
    if (new Set(approvedOrigins).size !== approvedOrigins.length) errors.push('duplicate_approved_origin')
  }

  const lifecycle = value.lifecycle
  if (!isRecord(lifecycle) || !hasOnlyKeys(lifecycle, ['maxConcurrentSessions', 'maxSessionAgeMs', 'cleanupBatchSize'])) {
    errors.push('lifecycle_configuration_invalid')
  } else {
    if (!validateInteger(lifecycle.maxConcurrentSessions, 1, 1000)) errors.push('max_concurrent_sessions_invalid')
    if (!validateInteger(lifecycle.maxSessionAgeMs, 1000, 86400000)) errors.push('max_session_age_invalid')
    if (!validateInteger(lifecycle.cleanupBatchSize, 1, 1000)) errors.push('cleanup_batch_size_invalid')
    if (validateInteger(lifecycle.cleanupBatchSize, 1, 1000)
      && validateInteger(lifecycle.maxConcurrentSessions, 1, 1000)
      && lifecycle.cleanupBatchSize > lifecycle.maxConcurrentSessions) errors.push('cleanup_batch_exceeds_capacity')
  }

  const security = value.security
  if (!isRecord(security) || !hasOnlyKeys(security, ['productionExecutionEnabled', 'executeChangeEnabled', 'buyerManagedCredentials', 'requireApproval'])) {
    errors.push('security_configuration_invalid')
  } else {
    if (security.productionExecutionEnabled !== false) errors.push('production_execution_must_remain_disabled')
    if (security.executeChangeEnabled !== false) errors.push('execute_change_must_remain_disabled')
    if (security.buyerManagedCredentials !== true) errors.push('buyer_managed_credentials_required')
    if (security.requireApproval !== true) errors.push('approval_required')
  }

  const telemetry = value.telemetry
  if (!isRecord(telemetry) || !hasOnlyKeys(telemetry, ['mode', 'destinationRef'])) {
    errors.push('telemetry_configuration_invalid')
  } else {
    if (!TELEMETRY_MODES.has(telemetry.mode as PortableBrowserTelemetryMode)) errors.push('telemetry_mode_invalid')
    if (!validateReference(telemetry.destinationRef)) errors.push('telemetry_destination_ref_invalid')
    if (telemetry.mode === 'buyer_managed' && telemetry.destinationRef === undefined) errors.push('telemetry_destination_ref_required')
    if (telemetry.mode === 'disabled' && telemetry.destinationRef !== undefined) errors.push('telemetry_destination_ref_forbidden')
  }

  const evidence = value.evidence
  if (!isRecord(evidence) || !hasOnlyKeys(evidence, ['retentionMode', 'destinationRef'])) {
    errors.push('evidence_configuration_invalid')
  } else {
    if (!EVIDENCE_MODES.has(evidence.retentionMode as PortableBrowserEvidenceRetentionMode)) errors.push('evidence_retention_mode_invalid')
    if (!validateReference(evidence.destinationRef)) errors.push('evidence_destination_ref_invalid')
    if (evidence.retentionMode === 'buyer_managed' && evidence.destinationRef === undefined) errors.push('evidence_destination_ref_required')
    if (evidence.retentionMode !== 'buyer_managed' && evidence.destinationRef !== undefined) errors.push('evidence_destination_ref_forbidden')
  }

  if (value.deploymentMode === 'local' && approvedOrigins.some(origin => !LOOPBACK_HOSTS.has(new URL(origin).hostname))) {
    errors.push('local_deployment_requires_loopback_origins')
  }

  const uniqueErrors = Object.freeze([...new Set(errors)].sort())
  if (uniqueErrors.length > 0) return Object.freeze({ valid: false, errors: uniqueErrors })

  const normalized: PortableBrowserBuyerConfiguration = {
    schemaVersion: PORTABLE_BROWSER_BUYER_CONFIGURATION_SCHEMA_VERSION,
    deploymentMode: value.deploymentMode as PortableBrowserDeploymentMode,
    providerId: value.providerId as string,
    approvedOrigins: Object.freeze([...approvedOrigins].sort()),
    lifecycle: Object.freeze({
      maxConcurrentSessions: (lifecycle as Record<string, number>).maxConcurrentSessions,
      maxSessionAgeMs: (lifecycle as Record<string, number>).maxSessionAgeMs,
      cleanupBatchSize: (lifecycle as Record<string, number>).cleanupBatchSize,
    }),
    security: Object.freeze({
      productionExecutionEnabled: false,
      executeChangeEnabled: false,
      buyerManagedCredentials: true,
      requireApproval: true,
    }),
    telemetry: Object.freeze({
      mode: (telemetry as Record<string, unknown>).mode as PortableBrowserTelemetryMode,
      ...((telemetry as Record<string, unknown>).destinationRef === undefined ? {} : { destinationRef: (telemetry as Record<string, string>).destinationRef }),
    }),
    evidence: Object.freeze({
      retentionMode: (evidence as Record<string, unknown>).retentionMode as PortableBrowserEvidenceRetentionMode,
      ...((evidence as Record<string, unknown>).destinationRef === undefined ? {} : { destinationRef: (evidence as Record<string, string>).destinationRef }),
    }),
  }
  return Object.freeze({ valid: true, errors: Object.freeze([]), configuration: deepFreeze(normalized) })
}
