import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import type { CosUniversitySubjectId } from './cosUniversity.ts'

export const COS_UNIVERSITY_TEAM_CONTRIBUTION_PROFILE = 'cos_university_team_contribution_v1'

function identity(value: string, label: string): string {
  const cleaned = String(value || '').trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9._-]{0,119}$/.test(cleaned)) throw new Error(`${label}_invalid`)
  return cleaned
}

/** Records cooperation only when an independent verifier ties it to a teammate's improved outcome. */
export async function recordCosUniversityTeamContribution(input: {
  contributorAgentId: string
  beneficiaryAgentId: string
  subjectId: CosUniversitySubjectId
  contributionEvidenceRefs: readonly string[]
  beneficiaryOutcomeEvidenceRef: string
  independentScorer: boolean
  observedAt?: Date
}): Promise<{ stored: boolean; inserted: boolean; eligible: boolean; evidenceRef: string | null }> {
  const contributorAgentId = identity(input.contributorAgentId, 'contributor_agent_id')
  const beneficiaryAgentId = identity(input.beneficiaryAgentId, 'beneficiary_agent_id')
  if (contributorAgentId === beneficiaryAgentId) throw new Error('self_contribution_prohibited')
  const refs = [...new Set(input.contributionEvidenceRefs.map(String).filter(Boolean))]
  const outcomeRef = String(input.beneficiaryOutcomeEvidenceRef || '').trim()
  const eligible = input.independentScorer === true && refs.length > 0 && outcomeRef.length > 0
  const evidence = {
    profile: COS_UNIVERSITY_TEAM_CONTRIBUTION_PROFILE,
    semantics: 'independently_verified_help_that_improved_a_teammate_outcome',
    contributorAgentId,
    beneficiaryAgentId,
    subjectId: input.subjectId,
    contributionEvidenceRefs: refs,
    beneficiaryOutcomeEvidenceRef: outcomeRef,
    eligible,
  }
  const evidenceHash = createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
  const eventKey = createHash('sha256').update(`${COS_UNIVERSITY_TEAM_CONTRIBUTION_PROFILE}|${evidenceHash}`).digest('hex')
  const evidenceRef = `db://cos_university_learning_assurance_events/${eventKey}`
  const db = cosServiceDb()
  if (!db) return { stored: false, inserted: false, eligible, evidenceRef: null }
  const inserted = await db.from('cos_university_learning_assurance_events').insert({
    event_key: eventKey,
    event_type: 'team_contribution',
    subject_id: input.subjectId,
    candidate_id: contributorAgentId,
    evidence_hash: evidenceHash,
    evidence,
    verifier: input.independentScorer ? 'independent_scorer' : 'host_controller',
    observed_at: (input.observedAt || new Date()).toISOString(),
  })
  if (inserted.error) {
    if (String((inserted.error as { code?: unknown }).code || '') === '23505') return { stored: true, inserted: false, eligible, evidenceRef }
    throw inserted.error
  }
  return { stored: true, inserted: true, eligible, evidenceRef }
}

