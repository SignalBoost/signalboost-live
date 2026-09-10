export const COS_UNIVERSITY_MOTIVATION_PROFILE = 'cos_university_motivation_v1'

export type CosUniversityMotivationEvidence = Readonly<{
  agentId: string
  role: string
  subjectId: string
  appliedPasses: number
  appliedFailures: number
  retainedPasses: number
  teamContributions: number
  integrityViolations: number
}>

export type CosUniversityMotivationalState =
  | 'constructive_recovery'
  | 'team_lift'
  | 'healthy_stretch'
  | 'professional_pride'
  | 'steady_growth'

export type CosUniversityMotivationStanding = Readonly<{
  agentId: string
  role: string
  subjectId: string
  rank: number | null
  cohortSize: number
  state: CosUniversityMotivationalState
  studyPlanLimit: 4 | 6
  cooperationCredit: number
  reasons: readonly string[]
  authorityExpanded: false
}>

function eligible(row: CosUniversityMotivationEvidence): boolean {
  return row.integrityViolations === 0 && row.appliedPasses > 0
}

function compare(a: CosUniversityMotivationEvidence, b: CosUniversityMotivationEvidence): number {
  return b.appliedPasses - a.appliedPasses
    || b.retainedPasses - a.retainedPasses
    || b.teamContributions - a.teamContributions
    || a.appliedFailures - b.appliedFailures
    || a.agentId.localeCompare(b.agentId)
}

/**
 * Derives bounded, transparent machine incentives from host-verifiable evidence. Competition is
 * restricted to the same role and subject. It cannot grant authority, conceal failure, or turn
 * self-report, activity volume, confidence, or unrelated specialties into status.
 */
export function deriveCosUniversityMotivation(
  rows: readonly CosUniversityMotivationEvidence[],
): CosUniversityMotivationStanding[] {
  return rows.map(row => {
    const peers = rows.filter(peer => peer.role === row.role && peer.subjectId === row.subjectId && eligible(peer)).sort(compare)
    const index = peers.findIndex(peer => peer.agentId === row.agentId)
    const rank = index < 0 ? null : index + 1
    const cooperationCredit = Math.max(0, Math.floor(row.teamContributions))
    const reasons: string[] = []
    let state: CosUniversityMotivationalState = 'steady_growth'
    let studyPlanLimit: 4 | 6 = 4

    if (row.integrityViolations > 0 || row.appliedFailures > row.appliedPasses) {
      state = 'constructive_recovery'
      studyPlanLimit = 6
      reasons.push(row.integrityViolations > 0 ? 'integrity_review_and_remediation_required' : 'verified_failure_requires_remediation')
    } else if (row.appliedPasses > 0 && cooperationCredit === 0 && peers.some(peer => peer.agentId !== row.agentId)) {
      state = 'team_lift'
      reasons.push('help_a_peer_produce_an_independently_verified_outcome')
    } else if (rank !== null && rank > 1) {
      state = 'healthy_stretch'
      studyPlanLimit = 6
      reasons.push('comparable_peer_has_stronger_verified_application')
    } else if (rank === 1 && row.retainedPasses > 0 && cooperationCredit > 0) {
      state = 'professional_pride'
      reasons.push('leadership_requires_continued_application_and_team_contribution')
    } else {
      reasons.push('continue_role_aligned_learning_and_application')
    }

    return Object.freeze({
      agentId: row.agentId,
      role: row.role,
      subjectId: row.subjectId,
      rank,
      cohortSize: peers.length,
      state,
      studyPlanLimit,
      cooperationCredit,
      reasons: Object.freeze(reasons),
      authorityExpanded: false as const,
    })
  })
}

