import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { classifyProblemClass, knownProblemClasses } from '@/lib/ai/cos/cosProblemClass'
import { FOUNDATIONAL_KNOWLEDGE_DOMAINS } from '@/lib/cos-core/layers/learning/foundational'
import { attachTurnOutcome } from '@/lib/ai/cos/turnExperienceStore'

export const COS_VERIFIED_OUTCOME_DOMAINS = [
  'self_healing',
  'campaign',
  'sales',
  'crm',
  'governed_tool',
  'workflow',
  'other',
] as const

export type CosVerifiedOutcomeDomain = typeof COS_VERIFIED_OUTCOME_DOMAINS[number]
export type CosVerifiedOutcomeStatus = 'success' | 'failure' | 'observed'
export type CosVerifiedOutcomeSourceClass = 'deterministic_tool' | 'production_outcome' | 'authoritative_record'

export type CosVerifiedProductionOutcomeInput = {
  sourceClass: CosVerifiedOutcomeSourceClass
  sourceRef: string
  domain: CosVerifiedOutcomeDomain
  outcomeStatus: CosVerifiedOutcomeStatus
  summary: string
  problemClass?: string | null
  prompt?: string | null
  facts?: Record<string, unknown> | null
  correlation?: { kind: string; value: string } | null
  idempotencyKey?: string | null
  occurredAt?: string
}

export type CosVerifiedProductionOutcomeDecision = {
  eligible: true
  subject: string
  experienceHash: string
  sourceClass: CosVerifiedOutcomeSourceClass
  sourceRef: string
  domain: CosVerifiedOutcomeDomain
  outcomeStatus: CosVerifiedOutcomeStatus
  success: boolean | null
  score: number | null
  evidence: Record<string, unknown>
}

const CANONICAL_PROBLEM_CLASSES = new Set([
  ...knownProblemClasses(),
  ...FOUNDATIONAL_KNOWLEDGE_DOMAINS.map(domain => domain.subject),
])

function clean(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function boundedValue(value: unknown, depth = 0): unknown {
  if (value === null) return null
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string') return clean(value, 1000)
  if (depth >= 2) return undefined
  if (Array.isArray(value)) {
    return value.slice(0, 20)
      .map(item => boundedValue(item, depth + 1))
      .filter(item => item !== undefined)
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      const key = clean(rawKey, 120)
      if (!key) continue
      const safe = boundedValue(rawValue, depth + 1)
      if (safe !== undefined) result[key] = safe
    }
    return result
  }
  return undefined
}

function boundedFacts(value: unknown): Record<string, unknown> {
  const bounded = boundedValue(value)
  return bounded && typeof bounded === 'object' && !Array.isArray(bounded)
    ? bounded as Record<string, unknown>
    : {}
}

function normalizedOccurredAt(value: unknown): string {
  const candidate = clean(value, 80)
  if (!candidate) return new Date().toISOString()
  const time = Date.parse(candidate)
  return Number.isFinite(time) ? new Date(time).toISOString() : new Date().toISOString()
}

function normalizedProblemClass(input: CosVerifiedProductionOutcomeInput, summary: string): string {
  const provided = clean(input.problemClass, 180)
  if (provided && CANONICAL_PROBLEM_CLASSES.has(provided)) return provided
  return classifyProblemClass(clean(input.prompt || provided || summary, 20_000))
}

export function decideVerifiedCosProductionOutcome(
  input: CosVerifiedProductionOutcomeInput,
): CosVerifiedProductionOutcomeDecision {
  const sourceClass = clean(input?.sourceClass, 80) as CosVerifiedOutcomeSourceClass
  if (!['deterministic_tool', 'production_outcome', 'authoritative_record'].includes(sourceClass)) {
    throw new Error('Unsupported verified COS outcome source class.')
  }

  const sourceRef = clean(input?.sourceRef, 1000)
  if (!sourceRef) throw new Error('Verified COS outcome sourceRef is required.')
  if (/^(?:model|council|llm|consensus|frontier_teacher):/i.test(sourceRef)) {
    throw new Error('Model/Council output cannot be a verified COS production outcome source.')
  }

  const domain = clean(input?.domain, 80) as CosVerifiedOutcomeDomain
  if (!(COS_VERIFIED_OUTCOME_DOMAINS as readonly string[]).includes(domain)) {
    throw new Error('Unsupported verified COS outcome domain.')
  }

  const outcomeStatus = clean(input?.outcomeStatus, 40) as CosVerifiedOutcomeStatus
  if (!['success', 'failure', 'observed'].includes(outcomeStatus)) {
    throw new Error('Unsupported verified COS outcome status.')
  }

  const summary = clean(input?.summary, 4000)
  if (!summary) throw new Error('Verified COS outcome summary is required.')

  const subject = normalizedProblemClass(input, summary)
  const correlationKind = clean(input?.correlation?.kind, 120)
  const correlationValue = clean(input?.correlation?.value, 500)
  const idempotencyKey = clean(
    input?.idempotencyKey || `${sourceClass}:${sourceRef}:${correlationKind}:${correlationValue}`,
    2200,
  )
  if (!idempotencyKey) throw new Error('Verified COS outcome idempotency key is required.')

  const success = outcomeStatus === 'success' ? true : outcomeStatus === 'failure' ? false : null
  const score = success === true ? 1 : success === false ? 0 : null
  const experienceHash = sha256(`verified-production-outcome:${idempotencyKey}`)
  const evidence = {
    schemaVersion: 1,
    semantics: 'verified_production_outcome_signal_not_factual_promotion',
    successSemantics: 'externally_verified_real_world_outcome',
    promotionPolicy: 'no_automatic_fact_or_skill_promotion',
    sourceClass,
    domain,
    outcomeStatus,
    summary,
    correlation: correlationKind && correlationValue
      ? { kind: correlationKind, value: correlationValue }
      : null,
    facts: boundedFacts(input?.facts),
  }

  return {
    eligible: true,
    subject,
    experienceHash,
    sourceClass,
    sourceRef,
    domain,
    outcomeStatus,
    success,
    score,
    evidence,
  }
}

async function attachCorrelatedTurnOutcome(
  input: CosVerifiedProductionOutcomeInput,
  decision: CosVerifiedProductionOutcomeDecision,
  occurredAt: string,
): Promise<void> {
  const kind = clean(input.correlation?.kind, 120).toLowerCase()
  const turnId = clean(input.correlation?.value, 80)
  if (kind !== 'cos_turn_id' || !turnId) return
  await attachTurnOutcome(turnId, {
    ...(decision.success === null ? {} : {
      verifiedSuccess: decision.success,
      repairNeeded: !decision.success,
    }),
    source: `verified_production_outcome:${decision.sourceClass}`,
    occurredAt,
  })
}

/**
 * Persist one idempotent verified production/business outcome as `production_use` episodic memory.
 * Duplicate delivery of the same authoritative event is ignored rather than treated as new proof.
 * If the event carries `correlation.kind = cos_turn_id`, the same evidence also enriches the durable
 * turn outcome used by metacognitive routing/source-utilization analysis.
 */
export async function recordVerifiedCosProductionOutcome(
  input: CosVerifiedProductionOutcomeInput,
): Promise<{ stored: boolean; inserted: boolean; decision: CosVerifiedProductionOutcomeDecision }> {
  const decision = decideVerifiedCosProductionOutcome(input)
  const db = cosServiceDb()
  if (!db) return { stored: false, inserted: false, decision }

  const occurredAt = normalizedOccurredAt(input.occurredAt)
  const insert = await db.from('cos_cognitive_experiences').insert({
    experience_hash: decision.experienceHash,
    subject: decision.subject,
    experience_kind: 'production_use',
    source_kind: 'verified_objective_outcome',
    source_ref: decision.sourceRef,
    success: decision.success,
    score: decision.score,
    evidence: decision.evidence,
    first_observed_at: occurredAt,
    last_observed_at: occurredAt,
    updated_at: occurredAt,
  })

  let inserted = true
  if (insert.error) {
    const code = clean((insert.error as { code?: unknown }).code, 40)
    if (code === '23505') inserted = false
    else throw insert.error
  }

  await attachCorrelatedTurnOutcome(input, decision, occurredAt)
  return { stored: true, inserted, decision }
}
