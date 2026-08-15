import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { recordVerifiedCognitiveProductionOutcome } from '@/lib/ai/cos/cognitiveProductionOutcome'
import type { CouncilRole } from '@/lib/ai/cos/cognitiveCouncil'
import {
  normalizeCouncilMachinePrediction,
  resolveCouncilMachinePrediction,
  type CouncilMachinePrediction,
} from '@/lib/ai/cos/councilMachinePrediction'

export type CouncilClaimResolutionSummary = {
  outcomeId: string
  sessionId: string | null
  predictionsFound: number
  predictionsResolved: number
  supported: number
  refuted: number
  roleScoresInserted: number
  skillSuccessesRecorded: number
}

type StoredClaim = {
  claim?: unknown
  evidence?: unknown
  machinePrediction?: unknown
  machine_prediction?: unknown
}

type ResolvedClaim = {
  opinionId: string
  role: CouncilRole
  claimIndex: number
  prediction: CouncilMachinePrediction
  verdict: 'supported' | 'refuted'
  actual: string | number | boolean
  evidence: string[]
}

function safeText(value: unknown, max = 1200): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function claimsArray(value: unknown): StoredClaim[] {
  return Array.isArray(value) ? value.filter(item => item && typeof item === 'object') as StoredClaim[] : []
}

function evidenceLabels(claim: StoredClaim): string[] {
  return Array.isArray(claim.evidence)
    ? claim.evidence.map(item => safeText(item, 40)).filter(Boolean).slice(0, 12)
    : []
}

function roleSkillKeys(
  claims: StoredClaim[],
  skillRefs: Record<string, unknown>,
): string[] {
  const predictionClaims = claims.filter(claim => normalizeCouncilMachinePrediction(claim.machinePrediction ?? claim.machine_prediction))
  if (!predictionClaims.length) return []
  let shared: string | null = null
  for (const claim of predictionClaims) {
    const labels = evidenceLabels(claim).filter(label => /^\[SK\d{1,2}\]$/.test(label))
    const keys = [...new Set(labels.map(label => safeText(skillRefs[label], 240)).filter(Boolean))]
    if (keys.length !== 1) return []
    if (shared === null) shared = keys[0]
    else if (shared !== keys[0]) return []
  }
  return shared ? [shared] : []
}

async function refreshSessionResolutionCount(sessionId: string): Promise<void> {
  const db = cosServiceDb()
  if (!db) return
  const count = await db.from('cos_council_claim_resolutions')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
  if (count.error) return
  await db.from('cos_council_sessions')
    .update({ objective_claim_resolution_count: Number(count.count ?? 0) })
    .eq('id', sessionId)
}

/**
 * Mechanically resolve pre-registered Council predictions from one objective outcome.
 *
 * No model call is made here. A role gets one automatic credibility case only when every bounded
 * machine prediction it registered is present in THIS outcome and all comparisons agree. Partial,
 * mixed, or missing facts remain unscored. Refuted roles are routed to the existing gap-driven
 * learning lifecycle by the database RPC; a cognitive skill receives positive production evidence
 * only when every scored prediction unambiguously cited the same validated [SK#] procedure.
 */
export async function resolveCouncilObjectiveOutcomeClaims(outcomeId: string): Promise<CouncilClaimResolutionSummary> {
  if (!validUuid(outcomeId)) throw new Error('A valid Council objective outcome id is required.')
  const db = cosServiceDb()
  if (!db) throw new Error('COS service database is unavailable.')

  const outcomeResult = await db.from('cos_council_objective_outcomes')
    .select('id,session_id,source_class,source_ref,outcome_status,summary,facts')
    .eq('id', outcomeId)
    .maybeSingle()
  if (outcomeResult.error) throw outcomeResult.error
  if (!outcomeResult.data) throw new Error('Council objective outcome was not found.')

  const sessionId = typeof outcomeResult.data.session_id === 'string' ? outcomeResult.data.session_id : null
  const empty: CouncilClaimResolutionSummary = {
    outcomeId,
    sessionId,
    predictionsFound: 0,
    predictionsResolved: 0,
    supported: 0,
    refuted: 0,
    roleScoresInserted: 0,
    skillSuccessesRecorded: 0,
  }
  if (!sessionId) return empty

  const [sessionResult, opinionResult] = await Promise.all([
    db.from('cos_council_sessions')
      .select('id,problem_class,cognitive_skill_refs')
      .eq('id', sessionId)
      .maybeSingle(),
    db.from('cos_council_opinions')
      .select('id,role,claims')
      .eq('session_id', sessionId),
  ])
  if (sessionResult.error) throw sessionResult.error
  if (opinionResult.error) throw opinionResult.error
  if (!sessionResult.data) return empty

  const facts = objectRecord(outcomeResult.data.facts)
  const outcomeStatus = safeText(outcomeResult.data.outcome_status, 40)
  const skillRefs = objectRecord(sessionResult.data.cognitive_skill_refs)
  const resolved: ResolvedClaim[] = []
  let predictionsFound = 0

  const opinions = (opinionResult.data ?? []).map(row => ({
    id: safeText(row.id, 80),
    role: safeText(row.role, 40) as CouncilRole,
    claims: claimsArray(row.claims),
  }))

  for (const opinion of opinions) {
    opinion.claims.forEach((claim, claimIndex) => {
      const prediction = normalizeCouncilMachinePrediction(claim.machinePrediction ?? claim.machine_prediction)
      if (!prediction) return
      predictionsFound += 1
      const resolution = resolveCouncilMachinePrediction(prediction, facts, outcomeStatus)
      if (resolution.verdict === 'unresolved' || resolution.actual === undefined) return
      resolved.push({
        opinionId: opinion.id,
        role: opinion.role,
        claimIndex,
        prediction,
        verdict: resolution.verdict,
        actual: resolution.actual,
        evidence: evidenceLabels(claim),
      })
    })
  }

  if (resolved.length) {
    const rows = resolved.map(item => ({
      outcome_id: outcomeId,
      session_id: sessionId,
      opinion_id: item.opinionId,
      role: item.role,
      claim_index: item.claimIndex,
      verdict: item.verdict,
      fact_path: item.prediction.factPath,
      operator: item.prediction.operator,
      expected: item.prediction.expected,
      actual: item.actual,
    }))
    const write = await db.from('cos_council_claim_resolutions').upsert(rows, {
      onConflict: 'outcome_id,opinion_id,claim_index',
      ignoreDuplicates: true,
    })
    if (write.error) throw write.error
    await refreshSessionResolutionCount(sessionId)
  }

  let roleScoresInserted = 0
  let skillSuccessesRecorded = 0
  for (const opinion of opinions) {
    const predictions = opinion.claims
      .map((claim, claimIndex) => ({ claim, claimIndex, prediction: normalizeCouncilMachinePrediction(claim.machinePrediction ?? claim.machine_prediction) }))
      .filter(item => Boolean(item.prediction))
    if (!predictions.length) continue

    const roleResolved = resolved.filter(item => item.opinionId === opinion.id)
    if (roleResolved.length !== predictions.length) continue
    const verdicts = [...new Set(roleResolved.map(item => item.verdict))]
    if (verdicts.length !== 1) continue
    const verdict = verdicts[0] as 'supported' | 'refuted'
    const skillKeys = verdict === 'supported' ? roleSkillKeys(opinion.claims, skillRefs) : []

    const score = await db.rpc('cos_record_council_objective_role_score', {
      p_session_id: sessionId,
      p_outcome_id: outcomeId,
      p_role: opinion.role,
      p_verdict: verdict,
      p_resolution_count: roleResolved.length,
      p_skill_keys: skillKeys,
    })
    if (score.error) throw score.error
    const scoreData = objectRecord(score.data)
    if (!scoreData.inserted) continue
    roleScoresInserted += 1

    if (verdict === 'supported' && skillKeys.length === 1) {
      try {
        const recorded = await recordVerifiedCognitiveProductionOutcome({
          skillKey: skillKeys[0],
          success: true,
          score: 1,
          evidence: {
            source: 'council_objective_prediction',
            sessionId,
            outcomeId,
            role: opinion.role,
            sourceRef: safeText(outcomeResult.data.source_ref, 1000),
            resolutionCount: roleResolved.length,
            deterministicOnly: true,
          },
        })
        if (recorded) skillSuccessesRecorded += 1
      } catch (error) {
        console.warn('[cos-council-claim-resolution] skill success attribution failed closed', error instanceof Error ? error.message : String(error))
      }
    }
  }

  return {
    outcomeId,
    sessionId,
    predictionsFound,
    predictionsResolved: resolved.length,
    supported: resolved.filter(item => item.verdict === 'supported').length,
    refuted: resolved.filter(item => item.verdict === 'refuted').length,
    roleScoresInserted,
    skillSuccessesRecorded,
  }
}
