import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { extractCouncilCognitiveSkillRefs } from '@/lib/ai/cos/councilPromptProvenance'
import {
  extractCouncilCorrelationRefs,
  normalizeCouncilObjectiveOutcome,
  type CouncilCorrelationKind,
  type CouncilObjectiveOutcomeInput,
  type CouncilObjectiveOutcomeResult,
} from '@/lib/ai/cos/councilObjectiveOutcomePure'

export * from '@/lib/ai/cos/councilObjectiveOutcomePure'
export { extractCouncilCognitiveSkillRefs } from '@/lib/ai/cos/councilPromptProvenance'

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export async function bindCouncilSessionCorrelations(sessionId: string, prompt: string): Promise<Partial<Record<CouncilCorrelationKind, string>>> {
  if (!validUuid(sessionId)) return {}
  const refs = extractCouncilCorrelationRefs(prompt)
  const skillRefs = extractCouncilCognitiveSkillRefs(prompt)
  if (!Object.keys(refs).length && !Object.keys(skillRefs).length) return refs
  const db = cosServiceDb()
  if (!db) return refs
  const update: Record<string, unknown> = {}
  if (Object.keys(refs).length) update.correlation_refs = refs
  if (Object.keys(skillRefs).length) update.cognitive_skill_refs = skillRefs
  const result = await db.from('cos_council_sessions').update(update).eq('id', sessionId)
  if (result.error) throw result.error
  return refs
}

export async function recordCouncilObjectiveOutcome(rawInput: CouncilObjectiveOutcomeInput): Promise<CouncilObjectiveOutcomeResult> {
  const input = normalizeCouncilObjectiveOutcome(rawInput)
  const db = cosServiceDb()
  if (!db) throw new Error('COS service database is unavailable.')
  const result = await db.rpc('cos_record_council_objective_outcome', {
    p_source_class: input.sourceClass,
    p_source_ref: input.sourceRef,
    p_correlation_kind: input.correlation.kind,
    p_correlation_value: input.correlation.value,
    p_outcome_status: input.outcomeStatus,
    p_summary: input.summary,
    p_facts: input.facts || {},
  })
  if (result.error) throw result.error
  const data = result.data && typeof result.data === 'object' ? result.data as Record<string, unknown> : {}
  const outcomeId = typeof data.outcome_id === 'string' && data.outcome_id ? data.outcome_id : null
  const matchedSessionId = typeof data.matched_session_id === 'string' && data.matched_session_id ? data.matched_session_id : null
  if (Boolean(data.inserted) && outcomeId && matchedSessionId) {
    try {
      const { resolveCouncilObjectiveOutcomeClaims } = await import('@/lib/ai/cos/councilClaimResolution')
      const resolution = await resolveCouncilObjectiveOutcomeClaims(outcomeId)
      console.info('[cos-council-claim-resolution]', JSON.stringify({
        at: new Date().toISOString(), outcomeId, sessionId: matchedSessionId,
        predictionsFound: resolution.predictionsFound,
        predictionsResolved: resolution.predictionsResolved,
        roleScoresInserted: resolution.roleScoresInserted,
        skillSuccessesRecorded: resolution.skillSuccessesRecorded,
      }))
    } catch (error) {
      console.warn('[cos-council-claim-resolution] objective resolution failed closed', error instanceof Error ? error.message : String(error))
    }
  }
  return {
    ok: true,
    inserted: Boolean(data.inserted),
    outcomeId,
    matchedSessionId,
    matchedProblemClass: typeof data.matched_problem_class === 'string' && data.matched_problem_class ? data.matched_problem_class : null,
    correlation: input.correlation,
    outcomeStatus: input.outcomeStatus,
  }
}
