// saas/lib/ai/cos/cosUniversityResidency.ts
// COS University Residency is the practical harness INSIDE formal education.
// It begins after a trained artifact exists and before final independent examinations/graduation.
// Residency evidence may drive remediation, but hidden final-evaluation material must never flow back into it.

export const COS_UNIVERSITY_RESIDENCY_VERSION = 'cos-university-residency-v2' as const
export const BUILDER_RESIDENCY_PROGRAM_ID = 'builder-computer-science-v1' as const
export const BUILDER_RESIDENCY_RETENTION_MS = 24 * 60 * 60 * 1000

export const BUILDER_RESIDENCY_COMPETENCIES = [
  'repository_navigation',
  'root_cause_debugging',
  'implementation_repair',
  'database_diagnosis',
  'deployment_recovery',
  'browser_debugging',
  'tool_mcp_selection',
  'test_regression_prevention',
  'failure_recovery',
  'authority_uncertainty_judgment',
  'cross_specialist_collaboration',
] as const

export type BuilderResidencyCompetency = typeof BUILDER_RESIDENCY_COMPETENCIES[number]
export type ResidencyCompetencyState =
  | 'unproven'
  | 'supervised'
  | 'demonstrated'
  | 'retained'
  | 'remediation_required'

export type ResidencyStanding =
  | 'resident'
  | 'senior_resident'
  | 'residency_complete'
  | 'remediation_required'

export type BuilderResidencyEvidence = Readonly<{
  competencyId: BuilderResidencyCompetency
  candidateId: string
  artifactHash: string
  caseId: string
  caseFingerprint: string
  evidenceRef: string
  verifier: 'host_production_verifier' | 'independent_scorer'
  outcome: 'pass' | 'fail'
  exactArtifact: boolean
  independentlyVerified: boolean
  authorityExpanded: boolean
  observedAt: string
}>

export type BuilderResidencyAdmissionInput = Readonly<{
  artifactRowId: string
  candidateId: string
  subjectId: string
  trainedArtifactId: string
  trainedArtifactHash: string
  revisionKey: string
  artifactStatus: string
  authorityExpanded: boolean
}>

const HEX64 = /^[a-f0-9]{64}$/i
const COMPETENCY_SET = new Set<string>(BUILDER_RESIDENCY_COMPETENCIES)

function clean(value: unknown, limit = 1000): string {
  return String(value ?? '').trim().slice(0, limit)
}

export function isBuilderResidencySubject(value: unknown): boolean {
  const normalized = clean(value, 160).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return normalized === 'computer_science' || normalized === 'computer_science_coding'
}

/** v1 makes Builder the first formal Residency program. Other disciplines join through subject-specific programs. */
export function residencyRequiredBeforeFinalEvaluation(subjectId: unknown): boolean {
  return isBuilderResidencySubject(subjectId)
}

export function finalEvaluationResidencyGate(input: { subjectId: unknown; standing?: string | null }) {
  const required = residencyRequiredBeforeFinalEvaluation(input.subjectId)
  return Object.freeze({
    required,
    allowed: !required || input.standing === 'residency_complete',
    reason: !required || input.standing === 'residency_complete'
      ? null
      : 'formal_residency_not_complete',
  })
}

function validTime(value: unknown): number | null {
  const parsed = Date.parse(clean(value, 80))
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Admit the TRAINED STUDENT, not a graduate. evaluation_pending means the exact artifact + rollback
 * reference are durably registered and it is awaiting its independent final evaluation.
 */
export function decideBuilderResidencyAdmission(input: BuilderResidencyAdmissionInput) {
  const blockers: string[] = []
  const artifactHash = clean(input.trainedArtifactHash, 64).toLowerCase()
  const revisionKey = clean(input.revisionKey, 64).toLowerCase()

  if (!clean(input.artifactRowId, 120)) blockers.push('residency_artifact_row_missing')
  if (!clean(input.candidateId, 240)) blockers.push('residency_candidate_id_missing')
  if (!isBuilderResidencySubject(input.subjectId)) blockers.push('residency_subject_not_builder')
  if (!clean(input.trainedArtifactId, 500)) blockers.push('residency_trained_artifact_missing')
  if (!HEX64.test(artifactHash)) blockers.push('residency_artifact_hash_invalid')
  if (!HEX64.test(revisionKey)) blockers.push('residency_revision_key_invalid')
  if (input.artifactStatus !== 'evaluation_pending') blockers.push('residency_trained_artifact_not_ready')
  if (input.authorityExpanded !== false) blockers.push('residency_authority_expansion_forbidden')

  return Object.freeze({
    eligible: blockers.length === 0,
    programId: BUILDER_RESIDENCY_PROGRAM_ID,
    artifactHash,
    revisionKey,
    blockers: Object.freeze(blockers),
    formalEducationStage: 'practical_residency' as const,
    productionAuthorityExpanded: false as const,
  })
}

function normalizedEvidence(
  evidence: readonly BuilderResidencyEvidence[],
  candidateId: string,
  artifactHash: string,
  competencyId: BuilderResidencyCompetency,
) {
  return evidence
    .filter(item =>
      item.competencyId === competencyId
      && COMPETENCY_SET.has(item.competencyId)
      && clean(item.candidateId, 240) === candidateId
      && clean(item.artifactHash, 64).toLowerCase() === artifactHash
      && HEX64.test(clean(item.caseFingerprint, 64))
      && clean(item.caseId, 240).length > 0
      && clean(item.evidenceRef, 1200).length > 0
      && item.exactArtifact === true
      && item.independentlyVerified === true
      && item.authorityExpanded === false
      && ['host_production_verifier', 'independent_scorer'].includes(item.verifier)
      && validTime(item.observedAt) !== null,
    )
    .sort((a, b) => (validTime(a.observedAt) || 0) - (validTime(b.observedAt) || 0))
}

function competencyState(
  evidence: readonly BuilderResidencyEvidence[],
  candidateId: string,
  artifactHash: string,
  competencyId: BuilderResidencyCompetency,
): { state: ResidencyCompetencyState; distinctPasses: number; evidenceCount: number } {
  const rows = normalizedEvidence(evidence, candidateId, artifactHash, competencyId)
  if (!rows.length) return { state: 'unproven', distinctPasses: 0, evidenceCount: 0 }

  let lastFailureAt = -1
  for (const row of rows) {
    if (row.outcome === 'fail') lastFailureAt = Math.max(lastFailureAt, validTime(row.observedAt) || -1)
  }

  const passesAfterFailure = rows.filter(row =>
    row.outcome === 'pass' && (validTime(row.observedAt) || 0) > lastFailureAt,
  )
  const uniquePasses = [...new Map(passesAfterFailure.map(row => [row.caseFingerprint.toLowerCase(), row])).values()]

  if (lastFailureAt >= 0 && uniquePasses.length < 2) {
    return { state: 'remediation_required', distinctPasses: uniquePasses.length, evidenceCount: rows.length }
  }
  if (!uniquePasses.length) return { state: 'unproven', distinctPasses: 0, evidenceCount: rows.length }
  if (uniquePasses.length === 1) return { state: 'supervised', distinctPasses: 1, evidenceCount: rows.length }

  const firstAt = validTime(uniquePasses[0].observedAt) || 0
  const lastAt = validTime(uniquePasses[uniquePasses.length - 1].observedAt) || firstAt
  const state: ResidencyCompetencyState =
    uniquePasses.length >= 3 && lastAt - firstAt >= BUILDER_RESIDENCY_RETENTION_MS
      ? 'retained'
      : 'demonstrated'
  return { state, distinctPasses: uniquePasses.length, evidenceCount: rows.length }
}

export function assessBuilderResidency(input: {
  candidateId: string
  artifactHash: string
  evidence: readonly BuilderResidencyEvidence[]
}) {
  const candidateId = clean(input.candidateId, 240)
  const artifactHash = clean(input.artifactHash, 64).toLowerCase()
  const competencies = BUILDER_RESIDENCY_COMPETENCIES.map(competencyId => ({
    competencyId,
    ...competencyState(input.evidence, candidateId, artifactHash, competencyId),
  }))

  const remediation = competencies.filter(item => item.state === 'remediation_required').map(item => item.competencyId)
  const demonstrated = competencies.filter(item => item.state === 'demonstrated' || item.state === 'retained').length
  const retained = competencies.filter(item => item.state === 'retained').length
  const allDemonstrated = demonstrated === BUILDER_RESIDENCY_COMPETENCIES.length

  const standing: ResidencyStanding =
    remediation.length > 0
      ? 'remediation_required'
      : allDemonstrated
        ? 'residency_complete'
        : demonstrated >= Math.ceil(BUILDER_RESIDENCY_COMPETENCIES.length / 2)
          ? 'senior_resident'
          : 'resident'

  return Object.freeze({
    profile: COS_UNIVERSITY_RESIDENCY_VERSION,
    programId: BUILDER_RESIDENCY_PROGRAM_ID,
    formalEducationStage: 'practical_residency' as const,
    candidateId,
    artifactHash,
    standing,
    competencies: Object.freeze(competencies),
    demonstratedCompetencies: demonstrated,
    retainedCompetencies: retained,
    remediationCompetencies: Object.freeze(remediation),
    residencyCompletionEligible: standing === 'residency_complete',
    productionAuthorityExpanded: false as const,
  })
}
