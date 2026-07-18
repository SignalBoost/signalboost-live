// Versioned, provider-neutral evidence envelope for cross-agent Enterprise Memory.
// Events describe observations only. They do not grant execution or approval authority.

export const ENTERPRISE_EVIDENCE_EVENT_VERSION = 1 as const

export type EnterpriseEvidenceAgent =
  | 'browser'
  | 'cos'
  | 'marketing'
  | 'repository'
  | 'supervisor'
  | 'vercel'
  | 'security'
  | 'system'

export type EnterpriseEvidenceEventType =
  | 'browser.navigation_completed'
  | 'browser.observation_recorded'
  | 'campaign.performance_updated'
  | 'cos.recommendation_generated'
  | 'deployment.failed'
  | 'deployment.succeeded'
  | 'incident.resolved'
  | 'repository.analysis_completed'
  | 'security.finding_recorded'
  | 'supervisor.diagnosis_generated'

export type EnterpriseEvidenceEntityRefs = Readonly<{
  campaignId?: string
  commitSha?: string
  deploymentId?: string
  incidentId?: string
  repository?: string
  sessionId?: string
}>

export type EnterpriseEvidenceEvent = Readonly<{
  version: typeof ENTERPRISE_EVIDENCE_EVENT_VERSION
  eventId: string
  type: EnterpriseEvidenceEventType
  organizationId: string
  workspace: string
  agent: EnterpriseEvidenceAgent
  occurredAt: string
  receivedAt: string
  confidence: number
  correlationId: string
  entities: EnterpriseEvidenceEntityRefs
  payload: Readonly<Record<string, unknown>>
  deduplicationKey: string
}>

export type EnterpriseEvidenceEventInput = {
  eventId?: unknown
  type: unknown
  organizationId: unknown
  workspace?: unknown
  agent: unknown
  occurredAt: unknown
  receivedAt?: unknown
  confidence?: unknown
  correlationId?: unknown
  entities?: unknown
  payload?: unknown
}

const EVENT_TYPES = new Set<EnterpriseEvidenceEventType>([
  'browser.navigation_completed',
  'browser.observation_recorded',
  'campaign.performance_updated',
  'cos.recommendation_generated',
  'deployment.failed',
  'deployment.succeeded',
  'incident.resolved',
  'repository.analysis_completed',
  'security.finding_recorded',
  'supervisor.diagnosis_generated',
])

const AGENTS = new Set<EnterpriseEvidenceAgent>([
  'browser',
  'cos',
  'marketing',
  'repository',
  'supervisor',
  'vercel',
  'security',
  'system',
])

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {}
}

function clamp01(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.min(1, Math.max(0, numeric))
}

function iso(value: unknown, field: string): string {
  const source = clean(value, 80)
  const timestamp = Date.parse(source)
  if (!source || !Number.isFinite(timestamp)) throw new Error(`${field} must be a valid ISO date.`)
  return new Date(timestamp).toISOString()
}

function identifier(value: unknown, field: string, max = 160): string {
  const result = clean(value, max)
  if (!result) throw new Error(`${field} is required.`)
  if (!/^[A-Za-z0-9._:@/+\-]+$/.test(result)) throw new Error(`${field} contains unsupported characters.`)
  return result
}

function eventType(value: unknown): EnterpriseEvidenceEventType {
  const result = clean(value, 100) as EnterpriseEvidenceEventType
  if (!EVENT_TYPES.has(result)) throw new Error('Evidence event type is not supported.')
  return result
}

function agent(value: unknown): EnterpriseEvidenceAgent {
  const result = clean(value, 40) as EnterpriseEvidenceAgent
  if (!AGENTS.has(result)) throw new Error('Evidence event agent is not supported.')
  return result
}

function sanitizeEntities(value: unknown): EnterpriseEvidenceEntityRefs {
  const source = object(value)
  const result: Record<string, string> = {}
  for (const key of ['campaignId', 'commitSha', 'deploymentId', 'incidentId', 'repository', 'sessionId'] as const) {
    const item = clean(source[key], 200)
    if (item) result[key] = item
  }
  return Object.freeze(result)
}

function stableEntityString(entities: EnterpriseEvidenceEntityRefs): string {
  return Object.entries(entities)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&')
}

export function normalizeEnterpriseEvidenceEvent(
  input: EnterpriseEvidenceEventInput,
  options: { now?: string } = {},
): EnterpriseEvidenceEvent {
  const type = eventType(input.type)
  const eventAgent = agent(input.agent)
  const organizationId = identifier(input.organizationId, 'organizationId', 120)
  const occurredAt = iso(input.occurredAt, 'occurredAt')
  const receivedAt = input.receivedAt ? iso(input.receivedAt, 'receivedAt') : iso(options.now || new Date().toISOString(), 'receivedAt')
  const workspace = clean(input.workspace, 80) || 'enterprise'
  const correlationId = clean(input.correlationId, 160)
  const entities = sanitizeEntities(input.entities)
  const eventId = clean(input.eventId, 160) || `${type}:${organizationId}:${occurredAt}:${stableEntityString(entities) || eventAgent}`
  const deduplicationKey = [organizationId, type, eventId].join('|').toLowerCase()

  return Object.freeze({
    version: ENTERPRISE_EVIDENCE_EVENT_VERSION,
    eventId,
    type,
    organizationId,
    workspace,
    agent: eventAgent,
    occurredAt,
    receivedAt,
    confidence: clamp01(input.confidence),
    correlationId: correlationId || eventId,
    entities,
    payload: Object.freeze(object(input.payload)),
    deduplicationKey,
  })
}

export function deduplicateEnterpriseEvidenceEvents(
  events: readonly EnterpriseEvidenceEvent[],
): readonly EnterpriseEvidenceEvent[] {
  const seen = new Set<string>()
  return Object.freeze(events.filter(event => {
    if (seen.has(event.deduplicationKey)) return false
    seen.add(event.deduplicationKey)
    return true
  }))
}
