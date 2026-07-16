import { SupervisorValidationError } from './errors.ts'

export const supervisorEnvironments = ['sandbox', 'preview', 'production'] as const
export const incidentSeverities = ['info', 'warning', 'critical'] as const
export const incidentSources = ['api', 'webhook', 'cron', 'manual'] as const

type SerializablePrimitive = string | number | boolean | null
export type SerializableValue = SerializablePrimitive | SerializableValue[] | { [key: string]: SerializableValue }

export interface IncidentEvidence {
  evidenceId: string
  type: string
  capturedAt: string
  summary: string
  reference?: string
  digest?: string
}

export interface SupervisorIncident {
  incidentId: string
  provider: string
  environment: (typeof supervisorEnvironments)[number]
  severity: (typeof incidentSeverities)[number]
  detectedAt: string
  source: (typeof incidentSources)[number]
  errorCode?: string
  errorMessage: string
  evidence: IncidentEvidence[]
  affectedResource?: string
  metadata: Record<string, SerializableValue>
}

const secretKeyPattern = /(password|apiKey|api_key|token|secret|privateKey|accessToken)/i

export function isPlainSerializable(value: unknown): value is SerializableValue {
  if (value === null) return true
  const type = typeof value
  if (type === 'string' || type === 'number' || type === 'boolean') return Number.isFinite(value as number) || type !== 'number'
  if (Array.isArray(value)) return value.every(isPlainSerializable)
  if (type !== 'object') return false
  if (Object.getPrototypeOf(value) !== Object.prototype) return false
  return Object.values(value as Record<string, unknown>).every(isPlainSerializable)
}

function assertString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new SupervisorValidationError(`${path} must be a non-empty string`)
  return value
}

function assertIsoDate(value: unknown, path: string): string {
  const stringValue = assertString(value, path)
  if (Number.isNaN(Date.parse(stringValue))) throw new SupervisorValidationError(`${path} must be a valid date string`)
  return stringValue
}

function rejectSecretKeys(value: unknown, path: string): void {
  if (Array.isArray(value)) value.forEach((entry, index) => rejectSecretKeys(entry, `${path}[${index}]`))
  else if (value && typeof value === 'object') {
    if (Object.getPrototypeOf(value) !== Object.prototype) throw new SupervisorValidationError(`${path} must be plain serializable data`)
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (secretKeyPattern.test(key) && !key.endsWith('Ref')) throw new SupervisorValidationError(`${path}.${key} must not contain plaintext secret material`)
      rejectSecretKeys(nested, `${path}.${key}`)
    }
  }
}

export const incidentSchema = {
  parse(candidate: unknown): SupervisorIncident {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || Object.getPrototypeOf(candidate) !== Object.prototype) {
      throw new SupervisorValidationError('incident must be a plain object')
    }
    const input = candidate as Record<string, unknown>
    const evidence = input.evidence
    if (!Array.isArray(evidence) || evidence.length === 0) throw new SupervisorValidationError('evidence must be a non-empty array')
    const metadata = input.metadata ?? {}
    if (!isPlainSerializable(metadata)) throw new SupervisorValidationError('metadata must contain only plain serializable values')
    rejectSecretKeys(metadata, 'metadata')
    const incident: SupervisorIncident = {
      incidentId: assertString(input.incidentId, 'incidentId'),
      provider: assertString(input.provider, 'provider'),
      environment: input.environment as SupervisorIncident['environment'],
      severity: input.severity as SupervisorIncident['severity'],
      detectedAt: assertIsoDate(input.detectedAt, 'detectedAt'),
      source: input.source as SupervisorIncident['source'],
      errorCode: input.errorCode === undefined ? undefined : assertString(input.errorCode, 'errorCode'),
      errorMessage: assertString(input.errorMessage, 'errorMessage'),
      evidence: evidence.map((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item) || Object.getPrototypeOf(item) !== Object.prototype) throw new SupervisorValidationError(`evidence[${index}] must be a plain object`)
        const ev = item as Record<string, unknown>
        return {
          evidenceId: assertString(ev.evidenceId, `evidence[${index}].evidenceId`),
          type: assertString(ev.type, `evidence[${index}].type`),
          capturedAt: assertIsoDate(ev.capturedAt, `evidence[${index}].capturedAt`),
          summary: assertString(ev.summary, `evidence[${index}].summary`),
          reference: ev.reference === undefined ? undefined : assertString(ev.reference, `evidence[${index}].reference`),
          digest: ev.digest === undefined ? undefined : assertString(ev.digest, `evidence[${index}].digest`),
        }
      }),
      affectedResource: input.affectedResource === undefined ? undefined : assertString(input.affectedResource, 'affectedResource'),
      metadata: metadata as Record<string, SerializableValue>,
    }
    if (!supervisorEnvironments.includes(incident.environment)) throw new SupervisorValidationError('environment is not supported')
    if (!incidentSeverities.includes(incident.severity)) throw new SupervisorValidationError('severity is not supported')
    if (!incidentSources.includes(incident.source)) throw new SupervisorValidationError('source is not supported')
    return incident
  },
}

export type InferIncident = SupervisorIncident
