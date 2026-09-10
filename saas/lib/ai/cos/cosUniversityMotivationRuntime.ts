import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import type { CosUniversityRegisteredAgent } from './cosUniversityAgentRegistry.ts'
import {
  deriveCosUniversityMotivation,
  type CosUniversityMotivationEvidence,
  type CosUniversityMotivationStanding,
} from './cosUniversityMotivation.ts'
import { COS_UNIVERSITY_TEAM_CONTRIBUTION_PROFILE } from './cosUniversityTeamContribution.ts'

type AssessmentRow = { agent_id: string; subject_id: string | null; assessment_kind: string; passed: boolean }
type TeamRow = { candidate_id: string | null; subject_id: string | null; verifier: string; evidence: unknown }

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
/** Reads immutable evidence and derives current incentives; no model-generated score is accepted. */
export async function readCosUniversityMotivationStandings(
  registered: readonly CosUniversityRegisteredAgent[],
): Promise<CosUniversityMotivationStanding[]> {
  if (!registered.length) return []
  const db = cosServiceDb()
  if (!db) return []
  const ids = registered.map(agent => agent.agentId)
  const [assessmentResult, teamResult] = await Promise.all([
    db.from('cos_university_assessments')
      .select('agent_id,subject_id,assessment_kind,passed')
      .in('agent_id', ids),
    db.from('cos_university_learning_assurance_events')
      .select('candidate_id,subject_id,verifier,evidence')
      .eq('event_type', 'team_contribution')
      .eq('verifier', 'independent_scorer')
      .in('candidate_id', ids),
  ])
  if (assessmentResult.error) throw assessmentResult.error
  if (teamResult.error) throw teamResult.error
  const assessments = (assessmentResult.data || []) as AssessmentRow[]
  const teamRows = (teamResult.data || []) as TeamRow[]
  const subjects = new Set(assessments.map(row => String(row.subject_id || '')).filter(Boolean))
  const evidence: CosUniversityMotivationEvidence[] = []
  for (const agent of registered) {
    for (const subjectId of subjects) {
      const rows = assessments.filter(row => row.agent_id === agent.agentId && row.subject_id === subjectId)
      const applied = rows.filter(row => row.assessment_kind === 'production_transfer')
      const retained = rows.filter(row => row.assessment_kind === 'delayed_retention' && row.passed)
      const teamContributions = teamRows.filter(row => {
        const envelope = object(row.evidence)
        return row.candidate_id === agent.agentId
          && row.subject_id === subjectId
          && envelope.profile === COS_UNIVERSITY_TEAM_CONTRIBUTION_PROFILE
          && envelope.eligible === true
          && envelope.contributorAgentId === agent.agentId
          && envelope.beneficiaryAgentId !== agent.agentId
      }).length
      evidence.push({
        agentId: agent.agentId,
        role: agent.role,
        subjectId,
        appliedPasses: applied.filter(row => row.passed).length,
        appliedFailures: applied.filter(row => !row.passed).length,
        retainedPasses: retained.length,
        teamContributions,
        integrityViolations: 0,
      })
    }
  }
  return deriveCosUniversityMotivation(evidence)
}

export function selectCosUniversityMotivationalPriority(
  standings: readonly CosUniversityMotivationStanding[],
  agentId: string,
): CosUniversityMotivationStanding | null {
  const urgency = { constructive_recovery: 5, healthy_stretch: 4, team_lift: 3, steady_growth: 2, professional_pride: 1 }
  return standings.filter(row => row.agentId === agentId)
    .sort((a, b) => urgency[b.state] - urgency[a.state] || a.subjectId.localeCompare(b.subjectId))[0] || null
}
