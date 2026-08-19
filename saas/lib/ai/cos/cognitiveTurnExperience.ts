// saas/lib/ai/cos/cognitiveTurnExperience.ts
import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { classifyProblemClass } from '@/lib/ai/cos/cosProblemClass'
import { recordCapabilityFailure, type CapabilityFailureKind } from '@/lib/ai/cos/benchmarkCuration'

export type CosTurnLearningProvenance = {
  responseSource?: string | null
  localModelInvoked?: boolean | null
  externalAiInvoked?: boolean | null
  reasonerLabel?: string | null
  similarityScore?: number | null
  knowledgeFactsCited?: number | null
  learnedItemsCited?: number | null
  enterpriseMemoriesCited?: number | null
  userMemoriesCited?: number | null
  cognitiveSkillsCited?: number | null
  liveExternalEvidence?: { sources?: unknown[] } | null
  cacheOrigin?: unknown
  escalationReasonCode?: string | null
  escalationReason?: string | null
  evidenceFunnel?: unknown
  cognitiveSkillFunnel?: unknown
}

export type CosTurnExperienceInput = {
  prompt: string
  handled: boolean
  confidence: number
  provenance?: CosTurnLearningProvenance | null
  failureReason?: string | null
  occurredAt?: string
}

export type CosTurnExperienceDecision = {
  eligible: boolean
  reason: string
  subject: string
  promptHash: string
  experienceHash: string
  acceptedByCosGate: boolean
  routeClass: 'cache' | 'local' | 'fresh' | 'external_required' | 'other'
  sourceKind: string
  evidence: Record<string, unknown>
}

function clean(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function count(value: unknown): number {
  const number = Number(value || 0)
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0
}

function routeClass(provenance: CosTurnLearningProvenance | null | undefined): CosTurnExperienceDecision['routeClass'] {
  const source = clean(provenance?.responseSource, 120).toLowerCase()
  if (source === 'semantic_cache' || source === 'semantic_similarity') return 'cache'
  if (source === 'local_cos_reasoning') return 'local'
  if (source === 'external_fallback_required') return 'external_required'
  if (source.includes('live') || source.includes('fresh') || source.includes('authoritative')) return 'fresh'
  return 'other'
}

function sourceKindFor(route: CosTurnExperienceDecision['routeClass']): string {
  if (route === 'cache') return 'cos_answer_reuse'
  if (route === 'local') return 'cos_local_reasoning'
  if (route === 'fresh') return 'cos_live_verification'
  if (route === 'external_required') return 'cos_local_escalation'
  return 'cos_runtime'
}

function benchmarkFailureKind(input: CosTurnExperienceInput): CapabilityFailureKind {
  const code = clean(input.provenance?.escalationReasonCode, 160).toLowerCase()
  const reason = clean(input.failureReason || input.provenance?.escalationReason, 600).toLowerCase()
  const combined = `${code} ${reason}`
  if (combined.includes('timeout') || combined.includes('expired')) return 'timeout_retry'
  if (combined.includes('schema') || combined.includes('pgrst')) return 'schema_error'
  if (combined.includes('tool')) return 'tool_error'
  if (Number(input.confidence || 0) < 0.72) return 'low_confidence'
  return 'unhandled_error'
}

async function captureFailedTurnForBenchmark(input: CosTurnExperienceInput, decision: CosTurnExperienceDecision): Promise<void> {
  if (decision.acceptedByCosGate) return
  const meaningfulFailure = decision.routeClass === 'external_required' || Boolean(input.failureReason) || Number(input.confidence || 0) < 0.72
  if (!meaningfulFailure) return
  try {
    await recordCapabilityFailure({
      prompt: input.prompt,
      track: decision.subject,
      failureKind: benchmarkFailureKind(input),
      requiresLocalReasoning: input.provenance?.localModelInvoked !== false,
      sourceMetadata: {
        source: 'cos_turn_experience',
        route: decision.routeClass,
      },
    })
  } catch (error) {
    console.warn('[cos-turn-learning] failed to queue benchmark candidate', error)
  }
}

/**
 * Deterministic admission policy for ordinary COS experience capture.
 *
 * This is episodic memory, NOT factual learning. It intentionally retains hashes and bounded
 * execution metadata rather than copying the model answer into durable knowledge. Volatile/current
 * facts may therefore create a routing/outcome experience without becoming timeless semantic truth.
 */
export function decideCosTurnExperience(input: CosTurnExperienceInput): CosTurnExperienceDecision {
  const prompt = clean(input.prompt, 20_000)
  const promptHash = sha256(prompt)
  const provenance = input.provenance ?? null
  const route = routeClass(provenance)
  const acceptedByCosGate = input.handled === true && Number(input.confidence || 0) > 0
  const subject = classifyProblemClass(prompt)
  const responseSource = clean(provenance?.responseSource || 'unknown', 120) || 'unknown'
  const experienceHash = sha256(`turn:${promptHash}:${responseSource}:${acceptedByCosGate ? 'accepted' : 'not_accepted'}`)

  if (!prompt) {
    return {
      eligible: false,
      reason: 'empty_prompt',
      subject,
      promptHash,
      experienceHash,
      acceptedByCosGate,
      routeClass: route,
      sourceKind: sourceKindFor(route),
      evidence: {},
    }
  }

  const evidence = {
    schemaVersion: 1,
    semantics: 'episodic_turn_signal_not_factual_truth',
    successSemantics: 'cos_gate_acceptance_not_verified_business_outcome',
    responseSource,
    routeClass: route,
    confidence: Number.isFinite(Number(input.confidence)) ? Math.max(0, Math.min(1, Number(input.confidence))) : 0,
    handled: input.handled === true,
    acceptedByCosGate,
    localModelInvoked: provenance?.localModelInvoked === true,
    externalAiInvoked: provenance?.externalAiInvoked === true,
    reasonerLabel: provenance?.reasonerLabel ? clean(provenance.reasonerLabel, 240) : null,
    similarityScore: Number.isFinite(Number(provenance?.similarityScore)) ? Number(provenance?.similarityScore) : null,
    cited: {
      knowledgeGraph: count(provenance?.knowledgeFactsCited),
      learnedCorpus: count(provenance?.learnedItemsCited),
      enterpriseMemory: count(provenance?.enterpriseMemoriesCited),
      userMemory: count(provenance?.userMemoriesCited),
      cognitiveSkills: count(provenance?.cognitiveSkillsCited),
    },
    liveEvidenceSources: Array.isArray(provenance?.liveExternalEvidence?.sources)
      ? provenance?.liveExternalEvidence?.sources?.length ?? 0
      : 0,
    fromCache: Boolean(provenance?.cacheOrigin),
    escalationReasonCode: provenance?.escalationReasonCode ? clean(provenance.escalationReasonCode, 160) : null,
    failureReason: input.failureReason ? clean(input.failureReason, 1000) : null,
    retentionPolicy: route === 'fresh' ? 'routing_outcome_only_no_volatile_fact_retention' : 'episodic_reconsolidation_eligible',
  }

  return {
    eligible: true,
    reason: 'meaningful_cos_turn',
    subject,
    promptHash,
    experienceHash,
    acceptedByCosGate,
    routeClass: route,
    sourceKind: sourceKindFor(route),
    evidence,
  }
}

/**
 * Persist an ordinary COS turn as episodic experience. Repeated identical turn outcomes strengthen
 * occurrence evidence instead of creating duplicate rows. Failures are learning signals, but this
 * function never creates a skill, fact, or confidence bonus by itself.
 */
export async function recordCosTurnExperience(input: CosTurnExperienceInput): Promise<{ stored: boolean; repeated: boolean; decision: CosTurnExperienceDecision }> {
  const decision = decideCosTurnExperience(input)
  if (!decision.eligible) return { stored: false, repeated: false, decision }

  // Keep benchmark curation independent from episodic-memory persistence. If either store has a
  // transient problem the other can still succeed, and real COS failures remain useful learning data.
  await captureFailedTurnForBenchmark(input, decision)

  const db = cosServiceDb()
  if (!db) return { stored: false, repeated: false, decision }

  const now = input.occurredAt || new Date().toISOString()
  try {
    const existing = await db
      .from('cos_cognitive_experiences')
      .select('id,occurrence_count')
      .eq('experience_hash', decision.experienceHash)
      .maybeSingle()

    if (existing.error) throw existing.error
    if (existing.data?.id) {
      const update = await db
        .from('cos_cognitive_experiences')
        .update({
          success: decision.acceptedByCosGate,
          score: Number(decision.evidence.confidence || 0),
          occurrence_count: Number(existing.data.occurrence_count || 1) + 1,
          evidence: decision.evidence,
          last_observed_at: now,
          updated_at: now,
        })
        .eq('id', existing.data.id)
      if (update.error) throw update.error
      return { stored: true, repeated: true, decision }
    }

    const insert = await db.from('cos_cognitive_experiences').insert({
      experience_hash: decision.experienceHash,
      subject: decision.subject,
      experience_kind: 'encounter',
      prompt_hash: decision.promptHash,
      source_kind: decision.sourceKind,
      source_ref: `cos-turn:${decision.promptHash}`,
      success: decision.acceptedByCosGate,
      score: Number(decision.evidence.confidence || 0),
      evidence: decision.evidence,
      first_observed_at: now,
      last_observed_at: now,
      updated_at: now,
    })
    if (insert.error) throw insert.error
    return { stored: true, repeated: false, decision }
  } catch (error) {
    console.warn('[cos-turn-learning] failed to persist episodic turn', error)
    return { stored: false, repeated: false, decision }
  }
}
