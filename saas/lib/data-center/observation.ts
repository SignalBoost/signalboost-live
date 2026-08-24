import { incidentSchema, type SerializableValue, type SupervisorIncident } from '../supervisor/incident-schema.ts'

export const dataCenterAssetClasses = [
  'ups',
  'pdu',
  'ats',
  'generator',
  'battery',
  'chiller',
  'cdu',
  'crac',
  'crah',
  'pump',
  'rack',
  'server',
  'network_switch',
  'fiber',
  'environment_sensor',
  'other',
] as const

export const dataCenterSourceKinds = [
  'simulator',
  'snmp',
  'syslog',
  'redfish',
  'prometheus',
  'monitoring_api',
  'dcim',
  'bms_gateway',
  'manual',
] as const

export const dataCenterSeverities = ['info', 'warning', 'critical'] as const
export const dataCenterEnvironments = ['sandbox', 'preview', 'production'] as const

export type DataCenterAssetClass = (typeof dataCenterAssetClasses)[number]
export type DataCenterSourceKind = (typeof dataCenterSourceKinds)[number]
export type DataCenterSeverity = (typeof dataCenterSeverities)[number]
export type DataCenterEnvironment = (typeof dataCenterEnvironments)[number]

export type DataCenterEvidence = {
  type: string
  summary: string
  reference?: string
}

export type DataCenterMetric = {
  name: string
  value: number
  unit: string
  warningThreshold?: number | null
  criticalThreshold?: number | null
  baseline?: number | null
}

export type DataCenterObservation = {
  observationId: string
  observedAt: string
  environment: DataCenterEnvironment
  siteId: string
  facilityArea?: string | null
  rowId?: string | null
  rackId?: string | null
  sourceSystem: string
  sourceKind: DataCenterSourceKind
  vendor?: string | null
  assetClass: DataCenterAssetClass
  assetId: string
  eventType: string
  message: string
  metric?: DataCenterMetric | null
  sourceSeverity?: string | null
  severity: DataCenterSeverity
  status?: string | null
  correlationKeys: string[]
  tags: Record<string, string>
  evidence: DataCenterEvidence[]
}

const secretKeyPattern = /(password|apiKey|api_key|token|secret|privateKey|accessToken)/i
const safeIdPattern = /^[A-Za-z0-9._:/-]{1,160}$/

function requiredString(value: unknown, path: string, max = 500): string {
  if (typeof value !== 'string') throw new Error(`${path}_must_be_string`)
  const clean = value.trim()
  if (!clean) throw new Error(`${path}_required`)
  if (clean.length > max) throw new Error(`${path}_too_long`)
  return clean
}

function optionalString(value: unknown, path: string, max = 500): string | null {
  if (value === undefined || value === null || value === '') return null
  return requiredString(value, path, max)
}

function safeIdentifier(value: unknown, path: string): string {
  const clean = requiredString(value, path, 160)
  if (!safeIdPattern.test(clean)) throw new Error(`${path}_invalid`)
  return clean
}

function isoDate(value: unknown): string {
  const clean = requiredString(value, 'observedAt', 80)
  if (Number.isNaN(Date.parse(clean))) throw new Error('observedAt_invalid')
  return new Date(clean).toISOString()
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T, path: string): T[number] {
  const clean = requiredString(value, path, 80)
  if (!allowed.includes(clean)) throw new Error(`${path}_unsupported`)
  return clean as T[number]
}

function finiteNumber(value: unknown, path: string): number {
  const n = Number(value)
  if (!Number.isFinite(n)) throw new Error(`${path}_must_be_finite`)
  return n
}

function optionalFiniteNumber(value: unknown, path: string): number | null {
  if (value === undefined || value === null || value === '') return null
  return finiteNumber(value, path)
}

function stringArray(value: unknown, path: string, maxItems = 12): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new Error(`${path}_must_be_array`)
  const unique = new Set<string>()
  for (const raw of value.slice(0, maxItems)) {
    const clean = safeIdentifier(raw, `${path}_item`)
    unique.add(clean)
  }
  return [...unique]
}

function tags(value: unknown): Record<string, string> {
  if (value === undefined || value === null) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('tags_must_be_plain_object')
  }
  const out: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>).slice(0, 24)) {
    if (secretKeyPattern.test(key)) throw new Error('tags_secret_shaped_key_rejected')
    const safeKey = safeIdentifier(key, 'tag_key')
    out[safeKey] = requiredString(raw, `tag_${safeKey}`, 240)
  }
  return out
}

function metric(value: unknown): DataCenterMetric | null {
  if (value === undefined || value === null) return null
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('metric_must_be_plain_object')
  }
  const input = value as Record<string, unknown>
  return {
    name: safeIdentifier(input.name, 'metric_name'),
    value: finiteNumber(input.value, 'metric_value'),
    unit: requiredString(input.unit, 'metric_unit', 40),
    warningThreshold: optionalFiniteNumber(input.warningThreshold, 'metric_warning_threshold'),
    criticalThreshold: optionalFiniteNumber(input.criticalThreshold, 'metric_critical_threshold'),
    baseline: optionalFiniteNumber(input.baseline, 'metric_baseline'),
  }
}

function evidence(value: unknown): DataCenterEvidence[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('evidence_required')
  return value.slice(0, 12).map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.getPrototypeOf(raw) !== Object.prototype) {
      throw new Error(`evidence_${index}_must_be_plain_object`)
    }
    const row = raw as Record<string, unknown>
    return {
      type: safeIdentifier(row.type, `evidence_${index}_type`),
      summary: requiredString(row.summary, `evidence_${index}_summary`, 1000),
      reference: optionalString(row.reference, `evidence_${index}_reference`, 1000) || undefined,
    }
  })
}

export function normalizeDataCenterObservation(candidate: unknown): DataCenterObservation {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || Object.getPrototypeOf(candidate) !== Object.prototype) {
    throw new Error('data_center_observation_must_be_plain_object')
  }
  const input = candidate as Record<string, unknown>
  return {
    observationId: safeIdentifier(input.observationId, 'observationId'),
    observedAt: isoDate(input.observedAt),
    environment: enumValue(input.environment, dataCenterEnvironments, 'environment'),
    siteId: safeIdentifier(input.siteId, 'siteId'),
    facilityArea: optionalString(input.facilityArea, 'facilityArea', 160),
    rowId: optionalString(input.rowId, 'rowId', 160),
    rackId: optionalString(input.rackId, 'rackId', 160),
    sourceSystem: safeIdentifier(input.sourceSystem, 'sourceSystem'),
    sourceKind: enumValue(input.sourceKind, dataCenterSourceKinds, 'sourceKind'),
    vendor: optionalString(input.vendor, 'vendor', 160),
    assetClass: enumValue(input.assetClass, dataCenterAssetClasses, 'assetClass'),
    assetId: safeIdentifier(input.assetId, 'assetId'),
    eventType: safeIdentifier(input.eventType, 'eventType'),
    message: requiredString(input.message, 'message', 1200),
    metric: metric(input.metric),
    sourceSeverity: optionalString(input.sourceSeverity, 'sourceSeverity', 120),
    severity: enumValue(input.severity, dataCenterSeverities, 'severity'),
    status: optionalString(input.status, 'status', 160),
    correlationKeys: stringArray(input.correlationKeys, 'correlationKeys'),
    tags: tags(input.tags),
    evidence: evidence(input.evidence),
  }
}

function resourcePath(observation: DataCenterObservation): string {
  return [
    observation.siteId,
    observation.facilityArea,
    observation.rowId,
    observation.rackId,
    observation.assetClass,
    observation.assetId,
  ].filter(Boolean).join('/')
}

function incidentMetadata(observation: DataCenterObservation): Record<string, SerializableValue> {
  const metric = observation.metric
    ? {
        name: observation.metric.name,
        value: observation.metric.value,
        unit: observation.metric.unit,
        warningThreshold: observation.metric.warningThreshold ?? null,
        criticalThreshold: observation.metric.criticalThreshold ?? null,
        baseline: observation.metric.baseline ?? null,
      }
    : null

  return {
    domain: 'data_center_operations',
    observationOnly: true,
    advisoryOnly: true,
    facilityControlAllowed: false,
    sourceKind: observation.sourceKind,
    sourceSystem: observation.sourceSystem,
    vendor: observation.vendor ?? null,
    siteId: observation.siteId,
    facilityArea: observation.facilityArea ?? null,
    rowId: observation.rowId ?? null,
    rackId: observation.rackId ?? null,
    assetClass: observation.assetClass,
    assetId: observation.assetId,
    eventType: observation.eventType,
    sourceSeverity: observation.sourceSeverity ?? null,
    status: observation.status ?? null,
    correlationKeys: observation.correlationKeys,
    tags: observation.tags,
    metric,
  }
}

export function dataCenterObservationToSupervisorIncident(input: DataCenterObservation | unknown): SupervisorIncident {
  const observation = normalizeDataCenterObservation(input)
  return incidentSchema.parse({
    incidentId: `dc:${observation.observationId}`,
    provider: `datacenter:${observation.sourceSystem}`,
    environment: observation.environment,
    severity: observation.severity,
    detectedAt: observation.observedAt,
    source: observation.sourceKind === 'manual' ? 'manual' : observation.sourceKind === 'simulator' ? 'cron' : 'webhook',
    errorCode: `dc_${observation.eventType}`.slice(0, 160),
    errorMessage: observation.message,
    affectedResource: resourcePath(observation),
    evidence: observation.evidence.map((item, index) => ({
      evidenceId: `${observation.observationId}:e${index + 1}`,
      type: item.type,
      capturedAt: observation.observedAt,
      summary: item.summary,
      reference: item.reference,
    })),
    metadata: incidentMetadata(observation),
  })
}
