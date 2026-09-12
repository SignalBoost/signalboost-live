import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  publicUniversityExamFeedback,
  validUniversityExamFeedbackIdentity,
  type UniversityExamFeedbackIdentity,
  type UniversityPublicExamFeedback,
} from './cosUniversityPublicExamFeedback.ts'

/**
 * Host-only privacy boundary. The planner receives a fixed category, never raw failure details.
 * Read only public response-contract and identity fields from the matching host assessment.
 * An unavailable observation changes no guidance; missing disclosure in a verified historical
 * assessment can withdraw only our previously appended suffix, not the original subject work.
 */
export async function loadUniversityPublicExamFeedback(
  identity: UniversityExamFeedbackIdentity,
): Promise<UniversityPublicExamFeedback | null> {
  if (!validUniversityExamFeedbackIdentity(identity)) return null
  const db = cosServiceDb()
  if (!db) return null
  try {
    const result = await db.from('cos_university_exam_runs')
      .select('id,agent_id,status,passed,completed_at,turn_id,response_source,local_model_invoked,external_ai_invoked,fresh_execution,provenance_recorded,reasons')
      .eq('id', identity.runId)
      .eq('agent_id', identity.agentId)
      .eq('status', 'failed')
      .eq('passed', false)
      .maybeSingle()
    if (result.error) return null
    if (!result.data) return null
    const assessment = await db.from('cos_university_assessments')
      .select('agent_id,assessment_key,source_ref,assessment_kind,passed,independent_scorer,scorer_authority,observed_at,response_contract:evidence->responseContract,turn_id:evidence->>turnId,response_source:evidence->>responseSource')
      .eq('agent_id', identity.agentId)
      .eq('assessment_key', `cos-university-exam:${identity.runId}`)
      .eq('source_ref', `cos_university_exam:${identity.runId}`)
      .eq('assessment_kind', 'unseen_subject_exam')
      .eq('independent_scorer', true)
      .eq('scorer_authority', 'host_private_exam')
      .eq('passed', false)
      .maybeSingle()
    if (assessment.error) return null
    return publicUniversityExamFeedback(result.data, identity, new Date(), assessment.data)
  } catch {
    // A transport rejection must not turn into either an invented weakness or a withdrawal.
    return null
  }
}
