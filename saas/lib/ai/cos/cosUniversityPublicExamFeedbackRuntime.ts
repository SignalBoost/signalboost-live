import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  publicUniversityExamFeedback,
  validUniversityExamFeedbackIdentity,
  type UniversityExamFeedbackIdentity,
  type UniversityPublicExamFeedback,
} from './cosUniversityPublicExamFeedback.ts'

/**
 * Host-only privacy boundary. The planner receives an allowlisted category, never raw failure
 * details. No case text, expected concepts, numeric limits, answers or examination material is read.
 * An unavailable observation adds no targeted claim; ordinary subject remediation remains available.
 */
export async function loadUniversityPublicExamFeedback(
  identity: UniversityExamFeedbackIdentity,
): Promise<UniversityPublicExamFeedback | null> {
  if (!validUniversityExamFeedbackIdentity(identity)) return null
  const db = cosServiceDb()
  if (!db) return null
  const result = await db.from('cos_university_exam_runs')
    .select('id,agent_id,status,passed,completed_at,response_source,local_model_invoked,external_ai_invoked,fresh_execution,provenance_recorded,reasons')
    .eq('id', identity.runId)
    .eq('agent_id', identity.agentId)
    .eq('status', 'failed')
    .eq('passed', false)
    .maybeSingle()
  if (result.error) return null
  return publicUniversityExamFeedback(result.data, identity)
}
