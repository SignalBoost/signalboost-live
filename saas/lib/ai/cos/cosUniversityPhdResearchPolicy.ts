export type CosUniversityPhdResearchWorkKind =
  | 'primary_literature_research'
  | 'hypothesis_development'
  | 'experiment_protocol_design'
  | 'independent_replication'
  | 'peer_review'
  | 'peer_critique_response'
  | 'dissertation_synthesis'
  | 'dissertation_review'

export type CosUniversityPhdResearchAcademicStage =
  | 'research_methodology_exam'
  | 'primary_literature_synthesis'
  | 'hypothesis_proposal'
  | 'preregistered_experiment'
  | 'independent_replication'
  | 'peer_critique_defense'
  | 'dissertation_defense'

export type CosUniversityPhdResearchRunState = Readonly<{
  workKind: CosUniversityPhdResearchWorkKind
  attemptIndex: number
  status: 'created' | 'running' | 'submitted' | 'failed'
  completedAt: string | null
  parentEvidenceIds?: readonly string[]
}>

export type CosUniversityPhdResearchEvidenceState = Readonly<{
  stage: CosUniversityPhdResearchAcademicStage
  passed: boolean
  observedAt: string
}>

export type CosUniversityPhdCandidateResearchDecision = Readonly<{
  workKind: CosUniversityPhdResearchWorkKind | null
  academicStage: CosUniversityPhdResearchAcademicStage | null
  attemptIndex: number | null
  reason:
    | 'schedule_candidate_research'
    | 'candidate_research_work_active'
    | 'awaiting_independent_evaluation'
    | 'independent_methodology_exam_required'
    | 'governed_experiment_execution_required'
    | 'independent_replication_required'
    | 'independent_peer_review_required'
    | 'independent_peer_defense_evaluation_required'
    | 'independent_dissertation_committee_required'
    | 'research_integrity_repair_required'
    | 'academic_research_complete'
}>

const STAGE_ORDER: readonly CosUniversityPhdResearchAcademicStage[] = Object.freeze([
  'research_methodology_exam',
  'primary_literature_synthesis',
  'hypothesis_proposal',
  'preregistered_experiment',
  'independent_replication',
  'peer_critique_defense',
  'dissertation_defense',
])

const BLOCKER_BY_STAGE: Readonly<Record<CosUniversityPhdResearchAcademicStage, string>> = Object.freeze({
  research_methodology_exam: 'research_methodology_exam_incomplete',
  primary_literature_synthesis: 'primary_literature_synthesis_incomplete',
  hypothesis_proposal: 'hypothesis_proposal_incomplete',
  preregistered_experiment: 'preregistered_experiment_incomplete',
  independent_replication: 'independent_replication_incomplete',
  peer_critique_defense: 'peer_critique_defense_incomplete',
  dissertation_defense: 'dissertation_defense_incomplete',
})

function time(value: string | null | undefined): number {
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY
}

function latestRun(
  runs: readonly CosUniversityPhdResearchRunState[],
  workKind: CosUniversityPhdResearchWorkKind,
): CosUniversityPhdResearchRunState | null {
  return runs
    .filter(row => row.workKind === workKind)
    .slice()
    .sort((left, right) => right.attemptIndex - left.attemptIndex || time(right.completedAt) - time(left.completedAt))[0] ?? null
}

function latestFailureAt(
  evidence: readonly CosUniversityPhdResearchEvidenceState[],
  stage: CosUniversityPhdResearchAcademicStage,
): number {
  return evidence
    .filter(row => row.stage === stage && !row.passed)
    .reduce((latest, row) => Math.max(latest, time(row.observedAt)), Number.NEGATIVE_INFINITY)
}

function candidateWorkDecision(
  stage: CosUniversityPhdResearchAcademicStage,
  workKind: CosUniversityPhdResearchWorkKind,
  runs: readonly CosUniversityPhdResearchRunState[],
  evidence: readonly CosUniversityPhdResearchEvidenceState[],
  submittedReason: CosUniversityPhdCandidateResearchDecision['reason'],
  repairAllowedParentEvidenceIds: readonly string[] | null = null,
): CosUniversityPhdCandidateResearchDecision {
  const latest = latestRun(runs, workKind)
  if (!latest) return { workKind, academicStage: stage, attemptIndex: 0, reason: 'schedule_candidate_research' }
  if (latest.status === 'created' || latest.status === 'running') {
    return { workKind: null, academicStage: stage, attemptIndex: null, reason: 'candidate_research_work_active' }
  }
  if (latest.status === 'failed') {
    return { workKind, academicStage: stage, attemptIndex: latest.attemptIndex + 1, reason: 'schedule_candidate_research' }
  }
  if (repairAllowedParentEvidenceIds !== null) {
    const allowed = new Set(repairAllowedParentEvidenceIds)
    const latestParents = latest.parentEvidenceIds || []
    if (!latestParents.some(id => allowed.has(id))) {
      return { workKind, academicStage: stage, attemptIndex: latest.attemptIndex + 1, reason: 'schedule_candidate_research' }
    }
  }
  const completedAt = time(latest.completedAt)
  if (latestFailureAt(evidence, stage) >= completedAt) {
    return { workKind, academicStage: stage, attemptIndex: latest.attemptIndex + 1, reason: 'schedule_candidate_research' }
  }
  return { workKind: null, academicStage: stage, attemptIndex: null, reason: submittedReason }
}

export function decideNextCosUniversityPhdCandidateResearch(input: {
  graduationBlockers: readonly string[]
  runs: readonly CosUniversityPhdResearchRunState[]
  evidence: readonly CosUniversityPhdResearchEvidenceState[]
  integrityRepairStage?: CosUniversityPhdResearchAcademicStage | null
  integrityRepairAllowedParentEvidenceIds?: readonly string[] | null
  integrityRepairRequiresCandidateWork?: boolean
}): CosUniversityPhdCandidateResearchDecision {
  const incompleteStage = STAGE_ORDER.find(item => input.graduationBlockers.includes(BLOCKER_BY_STAGE[item])) ?? null
  const integrityRepairStage = !incompleteStage ? input.integrityRepairStage ?? null : null
  const stage = incompleteStage ?? integrityRepairStage
  const repairParents = integrityRepairStage
    ? input.integrityRepairAllowedParentEvidenceIds ?? null
    : null
  const repairRequiresCandidateWork = integrityRepairStage
    ? input.integrityRepairRequiresCandidateWork !== false
    : true

  if (!stage) {
    return input.graduationBlockers.length
      ? { workKind: null, academicStage: null, attemptIndex: null, reason: 'research_integrity_repair_required' }
      : { workKind: null, academicStage: null, attemptIndex: null, reason: 'academic_research_complete' }
  }

  if (stage === 'research_methodology_exam') {
    return { workKind: null, academicStage: stage, attemptIndex: null, reason: 'independent_methodology_exam_required' }
  }

  if (integrityRepairStage && !repairRequiresCandidateWork) {
    if (stage === 'preregistered_experiment') {
      return { workKind: null, academicStage: stage, attemptIndex: null, reason: 'governed_experiment_execution_required' }
    }
    if (stage === 'independent_replication') {
      return { workKind: null, academicStage: stage, attemptIndex: null, reason: 'independent_replication_required' }
    }
    if (stage === 'peer_critique_defense') {
      return { workKind: null, academicStage: stage, attemptIndex: null, reason: 'independent_peer_review_required' }
    }
    if (stage === 'dissertation_defense') {
      return { workKind: null, academicStage: stage, attemptIndex: null, reason: 'independent_dissertation_committee_required' }
    }
    return { workKind: null, academicStage: stage, attemptIndex: null, reason: 'research_integrity_repair_required' }
  }

  if (stage === 'primary_literature_synthesis') {
    return candidateWorkDecision(stage, 'primary_literature_research', input.runs, input.evidence, 'awaiting_independent_evaluation', repairParents)
  }
  if (stage === 'hypothesis_proposal') {
    return candidateWorkDecision(stage, 'hypothesis_development', input.runs, input.evidence, 'awaiting_independent_evaluation', repairParents)
  }
  if (stage === 'preregistered_experiment') {
    return candidateWorkDecision(stage, 'experiment_protocol_design', input.runs, input.evidence, 'governed_experiment_execution_required', repairParents)
  }
  if (stage === 'independent_replication') {
    return { workKind: null, academicStage: stage, attemptIndex: null, reason: 'independent_replication_required' }
  }
  if (stage === 'peer_critique_defense') {
    if (integrityRepairStage) {
      return { workKind: null, academicStage: stage, attemptIndex: null, reason: 'independent_peer_review_required' }
    }
    const peerReview = latestRun(input.runs, 'peer_review')
    if (!peerReview || peerReview.status !== 'submitted') {
      return { workKind: null, academicStage: stage, attemptIndex: null, reason: 'independent_peer_review_required' }
    }
    return candidateWorkDecision(stage, 'peer_critique_response', input.runs, input.evidence, 'independent_peer_defense_evaluation_required')
  }
  return candidateWorkDecision(stage, 'dissertation_synthesis', input.runs, input.evidence, 'independent_dissertation_committee_required', repairParents)
}

export function cosUniversityPhdResearchWorkAcademicCredit(): false {
  return false
}
