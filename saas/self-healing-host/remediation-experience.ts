import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { summarizeRemediationExperience, type RemediationExperience, type RemediationExperienceRow } from './remediation-experience-pure'

export * from './remediation-experience-pure'

export async function readRemediationExperience(match: {
  provider: string
  environment: string
  incidentClass: string
}): Promise<RemediationExperience[]> {
  const db = cosServiceDb()
  if (!db) return []
  try {
    const { data, error } = await db
      .from('cos_council_objective_outcomes')
      .select('outcome_status,facts')
      .eq('source_class', 'deterministic_tool')
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) return []
    return summarizeRemediationExperience((data || []) as RemediationExperienceRow[], match)
  } catch {
    return []
  }
}
