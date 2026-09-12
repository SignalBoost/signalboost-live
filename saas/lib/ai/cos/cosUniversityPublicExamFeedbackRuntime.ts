import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  publicUniversityExamFeedback,
  validUniversityExamFeedbackIdentity,
  type UniversityExamFeedbackIdentity,
  type UniversityPublicExamFeedback,
} from './cosUniversityPublicExamFeedback.ts'

/**
 * Host-only privacy boundary. The planner receives an allowlisted category, never raw failure
 * details. Only the linked public response contract is read from assessment evidence; private
 * case text, expected concepts and answers are not selected or passed to the planner.
 * An unavailable observation adds no targeted claim; ordinary subject remediation remains available.
 */
export async function loadUniversityPublicExamFeedback(
  identity: UniversityExamFeedbackIdentity,
): Promise<UniversityPublicExamFeedback | null> {
  if (!validUniversityExamFeedbackIdentity(identity)) return null
  const db = cosServiceDb()
  if (!db) return null
  try {
    const result = await db.from('cos_university_exam_runs')
      .select('id,agent_id,status,passed,completed_at,response_source,local_model_invoked,external_ai_invoked,fresh_execution,provenance_recorded,reasons')
      .eq('id', identity.runId)
      .eq('agent_id', identity.agentId)
      .eq('status', 'failed')
      .eq('passed', false)
      .maybeSingle()
    if (result.error || !result.data) return null
    const disclosure = await db.from('cos_university_assessments')
      .select('assessment_key,agent_id,assessment_kind,passed,independent_scorer,scorer_authority,source_ref,observed_at,response_contract:evidence->responseContract')
      .eq('assessment_key', `cos-university-exam:${identity.runId}`)
      .eq('agent_id', identity.agentId)
      .eq('source_ref', `cos_university_exam:${identity.runId}`)
      .eq('assessment_kind', 'unseen_subject_exam')
      .eq('passed', false)
      .eq('independent_scorer', true)
      .eq('scorer_authority', 'host_private_exam')
      .maybeSingle()
    if (disclosure.error || !disclosure.data) return null
    return publicUniversityExamFeedback({ ...result.data, response_contract_evidence: disclosure.data }, identity)
  } catch {
    // An unavailable read neither creates targeted feedback nor removes previously supported guidance.
    return null
  }
}
