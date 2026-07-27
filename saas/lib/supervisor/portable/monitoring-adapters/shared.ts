import type { IncidentMapping, RawIncidentDelivery } from '../incident-source.ts'

export function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function first(...values: unknown[]): unknown {
  return values.find(value => value !== undefined && value !== null && String(value).trim() !== '')
}

export function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  const result = String(value).trim()
  return result || undefined
}

export function requiredString(value: unknown, fallback: string): string {
  return optionalString(value) ?? fallback
}

export function isNonIncidentState(...values: unknown[]): boolean {
  return values.some(value => /^(resolved|closed|ok|healthy|recovered|acknowledged|acknowledged_by_user|no_data|test|ping|heartbeat)$/i.test(optionalString(value) ?? ''))
}

export function mapping(input: {
  provider: string
  delivery: RawIncidentDelivery
  message: unknown
  severity?: unknown
  environment?: unknown
  detectedAt?: unknown
  errorCode?: unknown
  affectedResource?: unknown
  dedupeKey?: unknown
  evidenceType?: string
  metadata?: Record<string, unknown>
}): IncidentMapping {
  const errorMessage = requiredString(input.message, `${input.provider} monitoring alert`)
  const result: IncidentMapping = {
    provider: input.provider,
    errorMessage,
    evidence: [{
      type: input.evidenceType ?? 'monitoring-alert',
      summary: errorMessage,
      capturedAt: optionalString(input.detectedAt) ?? input.delivery.receivedAt,
    }],
    metadata: input.metadata ?? {},
  }
  const severity = optionalString(input.severity)
  const environment = optionalString(input.environment)
  const detectedAt = optionalString(input.detectedAt)
  const errorCode = optionalString(input.errorCode)
  const affectedResource = optionalString(input.affectedResource)
  const dedupeKey = optionalString(input.dedupeKey)
  if (severity) result.severity = severity
  if (environment) result.environment = environment
  if (detectedAt) result.detectedAt = detectedAt
  if (errorCode) result.errorCode = errorCode
  if (affectedResource) result.affectedResource = affectedResource
  if (dedupeKey) result.dedupeKey = dedupeKey
  return result
}
