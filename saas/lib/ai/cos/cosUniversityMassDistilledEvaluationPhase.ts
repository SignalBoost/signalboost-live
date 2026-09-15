import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export type MassDistilledEvaluationPhase = 'initial' | 'retention'

export async function claimMassDistilledEvaluationPhase(input: {
  candidateId: string
  artifactHash: string
  phase: MassDistilledEvaluationPhase
}) {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.rpc('claim_cos_university_mass_distilled_evaluation_phase', {
    p_candidate_id: input.candidateId,
    p_artifact_hash: input.artifactHash,
    p_phase: input.phase,
  })
  if (result.error) throw result.error
  const row: any = Array.isArray(result.data) ? result.data[0] : null
  return Object.freeze({
    claimed: row?.claimed === true,
    endpointCallsReserved: Number(row?.endpoint_calls_reserved || 0),
    judgeCallsReserved: Number(row?.judge_calls_reserved || 0),
    approvalEventKey: String(row?.approval_event_key || ''),
  })
}

export async function completeMassDistilledEvaluationPhase(input: {
  candidateId: string
  artifactHash: string
  phase: MassDistilledEvaluationPhase
}) {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.rpc('complete_cos_university_mass_distilled_evaluation_phase', {
    p_candidate_id: input.candidateId,
    p_artifact_hash: input.artifactHash,
    p_phase: input.phase,
  })
  if (result.error) throw result.error
  if (result.data !== true) throw new Error('mass_distilled_evaluation_phase_completion_failed')
  return Object.freeze({ completed: true as const, phase: input.phase })
}
