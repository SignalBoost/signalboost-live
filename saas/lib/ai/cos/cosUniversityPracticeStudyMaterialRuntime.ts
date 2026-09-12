import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { bindPracticeStudy, practiceStudyContentHashes, buildPracticeStudyMaterial, studyRecord,
  type PracticeStudyRequest, type PracticeStudyMaterial } from './cosUniversityPracticeStudyMaterial.ts'

/** Service-only, bounded reads from the exact queue, plan, completed acquisition and admitted content. */
export async function loadUniversityPracticeStudyMaterial(request: PracticeStudyRequest): Promise<PracticeStudyMaterial> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const queue = await db.from('cos_active_practice_queue').select('id,status,metadata').eq('id', request.runId)
    .contains('metadata', { origin: 'cos_university_deliberate_practice', agentId: request.agentId, executionBinding: 'agent_bound_practice_v1' }).maybeSingle()
  if (queue.error) throw queue.error
  const planId = studyRecord(studyRecord(queue.data).metadata).universityPlanId
  if (typeof planId !== 'string') throw new Error('university_practice_study_plan_missing')
  const plan = await db.from('cos_university_study_plans')
    .select('id,agent_id,status,attempt_count,last_attempt_at,evidence').eq('id', planId).eq('agent_id', request.agentId).maybeSingle()
  if (plan.error) throw plan.error
  const binding = bindPracticeStudy(request, queue.data, plan.data)
  const run = await db.from('cos_university_continuous_runs')
    .select('id,slot_key,status,started_at,completed_at,plan_ids,gap_diagnostics')
    .eq('started_at', binding.observedAt).eq('status', 'completed').contains('plan_ids', [binding.planId]).maybeSingle()
  if (run.error) throw run.error
  const hashes = practiceStudyContentHashes(binding, run.data)
  const documents = await db.from('cos_continuous_learning')
    .select('content_hash,source_kind,source_uri,source_title,summary,confidence,evidence,created_at')
    .in('content_hash', hashes).limit(4)
  if (documents.error) throw documents.error
  // The worker and atomic result RPC still revalidate study after inference, before any result write.
  return buildPracticeStudyMaterial(binding, run.data, documents.data || [])
}
