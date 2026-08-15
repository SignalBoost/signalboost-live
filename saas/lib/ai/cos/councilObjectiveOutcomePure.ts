export const COUNCIL_CORRELATION_KINDS = [
  'incident_id',
  'trace_id',
  'execution_id',
  'recovery_key',
  'deployment_id',
] as const

export type CouncilCorrelationKind = typeof COUNCIL_CORRELATION_KINDS[number]
export type CouncilObjectiveOutcomeStatus = 'success' | 'failure' | 'observed'
export type CouncilObjectiveOutcomeSourceClass = 'deterministic_tool' | 'production_outcome' | 'authoritative_record'

export type CouncilObjectiveCorrelation = {
  kind: CouncilCorrelationKind
  value: string
}

export type CouncilObjectiveOutcomeInput = {
  sourceClass: CouncilObjectiveOutcomeSourceClass
  sourceRef: string
  correlation: CouncilObjectiveCorrelation
  outcomeStatus: CouncilObjectiveOutcomeStatus
  summary: string
  facts?: Record<string, unknown>
}

export type CouncilObjectiveOutcomeResult = {
  ok: true
  inserted: boolean
  outcomeId: string | null
  matchedSessionId: string | null
  matchedProblemClass: string | null
  correlation: CouncilObjectiveCorrelation
  outcomeStatus: CouncilObjectiveOutcomeStatus
}

function safeText(value: unknown, max = 1200): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function safeCorrelationValue(value: unknown): string {
  return safeText(value, 500).replace(/[\u0000-\u001f\u007f]/g, '')
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = pattern.exec(text)
    const value = safeCorrelationValue(match?.[1])
    if (value) return value
  }
  return null
}

/** Extract only stable identifiers explicitly present in governed context; never infer semantic links. */
export function extractCouncilCorrelationRefs(prompt: string): Partial<Record<CouncilCorrelationKind, string>> {
  const text = String(prompt ?? '').slice(0, 80_000)
  const refs: Partial<Record<CouncilCorrelationKind, string>> = {}

  const incidentId = firstMatch(text, [
    /["']incident_id["']\s*:\s*["']([^"']{3,500})["']/i,
    /["']incidentId["']\s*:\s*["']([^"']{3,500})["']/i,
    /\bincident(?:\s+id)?\s*[:=]\s*([A-Za-z0-9._:/-]{3,500})/i,
  ])
  if (incidentId) refs.incident_id = incidentId

  const traceId = firstMatch(text, [
    /["']trace_id["']\s*:\s*["']([^"']{3,500})["']/i,
    /["']traceId["']\s*:\s*["']([^"']{3,500})["']/i,
  ])
  if (traceId) refs.trace_id = traceId

  const executionId = firstMatch(text, [
    /["']execution_id["']\s*:\s*["']([^"']{3,500})["']/i,
    /["']executionId["']\s*:\s*["']([^"']{3,500})["']/i,
  ])
  if (executionId) refs.execution_id = executionId

  const recoveryKey = firstMatch(text, [
    /["']recovery_key["']\s*:\s*["']([^"']{3,500})["']/i,
    /["']recoveryKey["']\s*:\s*["']([^"']{3,500})["']/i,
  ])
  if (recoveryKey) refs.recovery_key = recoveryKey

  const deploymentId = firstMatch(text, [
    /["']deployment_id["']\s*:\s*["']([^"']{3,500})["']/i,
    /["']deploymentId["']\s*:\s*["']([^"']{3,500})["']/i,
  ])
  if (deploymentId) refs.deployment_id = deploymentId

  return refs
}

export function normalizeCouncilObjectiveOutcome(input: CouncilObjectiveOutcomeInput): CouncilObjectiveOutcomeInput {
  const sourceClass = safeText(input?.sourceClass, 80) as CouncilObjectiveOutcomeSourceClass
  if (!['deterministic_tool', 'production_outcome', 'authoritative_record'].includes(sourceClass)) {
    throw new Error('Unsupported automatic Council outcome source class.')
  }

  const sourceRef = safeText(input?.sourceRef, 1000)
  if (!sourceRef) throw new Error('Council objective outcome sourceRef is required.')
  if (/^(?:model|council|llm|consensus|frontier_teacher):/i.test(sourceRef)) {
    throw new Error('Model/Council output cannot be an objective outcome source.')
  }

  const kind = safeText(input?.correlation?.kind, 80) as CouncilCorrelationKind
  if (!(COUNCIL_CORRELATION_KINDS as readonly string[]).includes(kind)) {
    throw new Error('Unsupported Council objective-outcome correlation kind.')
  }
  const value = safeCorrelationValue(input?.correlation?.value)
  if (!value) throw new Error('Council objective-outcome correlation value is required.')

  const outcomeStatus = safeText(input?.outcomeStatus, 40) as CouncilObjectiveOutcomeStatus
  if (!['success', 'failure', 'observed'].includes(outcomeStatus)) {
    throw new Error('Unsupported Council objective outcome status.')
  }

  const summary = safeText(input?.summary, 4000)
  if (!summary) throw new Error('Council objective outcome summary is required.')

  return {
    sourceClass,
    sourceRef,
    correlation: { kind, value },
    outcomeStatus,
    summary,
    facts: input?.facts && typeof input.facts === 'object' && !Array.isArray(input.facts) ? input.facts : {},
  }
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function safePrimitive(value: unknown): string | number | boolean | null | undefined {
  if (typeof value === 'string') return safeText(value, 500)
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'boolean') return value
  if (value === null) return null
  return undefined
}

/** Keep only non-secret verification facts from an execution result. */
export function boundedObjectiveFacts(result: unknown): Record<string, unknown> {
  const row = objectRecord(result)
  if (!row) return {}
  const allowedKeys = [
    'verified', 'changed', 'status', 'state', 'verificationStatus', 'verification_status',
    'policyInstanceId', 'previousIntervalSeconds', 'currentIntervalSeconds', 'schedulerSchedule',
    'nativeMonitoringIntervalSeconds', 'deploymentId', 'deploymentUrl', 'healthy', 'ok',
  ]
  const facts: Record<string, unknown> = {}
  for (const key of allowedKeys) {
    const safe = safePrimitive(row[key])
    if (safe !== undefined) facts[key] = safe
  }
  const verification = objectRecord(row.verification)
  if (verification) {
    const nested: Record<string, unknown> = {}
    for (const key of ['verified', 'status', 'state', 'deploymentId', 'deploymentUrl', 'healthy', 'ok']) {
      const safe = safePrimitive(verification[key])
      if (safe !== undefined) nested[key] = safe
    }
    if (Object.keys(nested).length) facts.verification = nested
  }
  return facts
}

function explicitVerificationState(result: unknown): boolean | null {
  const row = objectRecord(result)
  if (!row) return null
  if (typeof row.verified === 'boolean') return row.verified
  if (typeof row.healthy === 'boolean') return row.healthy

  const verification = objectRecord(row.verification)
  if (verification) {
    if (typeof verification.verified === 'boolean') return verification.verified
    if (typeof verification.healthy === 'boolean') return verification.healthy
  }

  const status = safeText(row.verificationStatus ?? row.verification_status ?? verification?.status, 80).toLowerCase()
  if (['verified', 'passed', 'healthy', 'ready', 'succeeded', 'success'].includes(status)) return true
  if (['failed', 'error', 'unhealthy', 'canceled', 'cancelled'].includes(status)) return false
  return null
}

export function classifyDeterministicToolOutcome(input: {
  ok: boolean
  result?: unknown
  error?: string | null
}): { status: CouncilObjectiveOutcomeStatus; summary: string; facts: Record<string, unknown> } {
  const facts = boundedObjectiveFacts(input.result)
  const verified = explicitVerificationState(input.result)
  if (!input.ok) {
    return {
      status: 'failure',
      summary: safeText(input.error || 'The governed deterministic tool execution failed.', 1200),
      facts,
    }
  }
  if (verified === true) {
    return {
      status: 'success',
      summary: 'The governed deterministic tool reported a successful verification/read-back.',
      facts,
    }
  }
  if (verified === false) {
    return {
      status: 'failure',
      summary: 'The governed deterministic tool explicitly reported verification failure.',
      facts,
    }
  }
  return {
    status: 'observed',
    summary: 'The governed tool execution completed, but its result did not contain an explicit verification predicate.',
    facts,
  }
}
