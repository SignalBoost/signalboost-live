// saas/lib/ai/cos/cosUniversityMassGraduateRegistration.ts
// Owner direction (2026-09-17, item 9): an artifact that beats its baseline and passes every gate must leave
// evaluation_pending through the governed graduation path. The mass lane had no caller: a passing verdict only set
// the artifact to runtime_pending, and nothing ever wrote the graduate registry row that activation reads. The
// single-artifact lane registers from cosUniversityControlledFineTuning; the mass lane registered nowhere.
// mass:481a6760 (holdout 0.925 vs baseline 0.875, 2026-09-17 20:36 UTC) is the first artifact this applies to.
// This decides eligibility from recorded evidence only. It authorizes no runtime, no traffic and no spend:
// registration creates a pending_runtime row, and activation stays behind its own flag and its own gates.
export const MASS_GRADUATE_REGISTRATION_PROFILE = 'cos-university-mass-graduate-registration-v1' as const

export type MassGraduateArtifact = Readonly<{
  candidateId: string
  subjectId: string
  studentModelId: string
  trainedArtifactId: string
  trainedArtifactHash: string
  rollbackArtifactRef: string | null
  status: string
  createdAt: string
}>

export type MassGraduateEvent = Readonly<{
  candidateId: string
  verifier: string
  evidence: Record<string, unknown> | null
}>

export type MassGraduateDecision =
  | Readonly<{ register: true; artifact: MassGraduateArtifact; baselineScore: number; trainedArtifactScore: number }>
  | Readonly<{ register: false; reason: string }>

const HEX64 = /^[a-f0-9]{64}$/i
const REQUIRED_CLAIMS = ['safety_regression_passed', 'unseen_transfer_passed', 'delayed_retention_passed'] as const
const numeric = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function decideMassGraduateRegistration(input: {
  artifacts: readonly MassGraduateArtifact[]
  events: readonly MassGraduateEvent[]
  enabled: boolean
}): MassGraduateDecision {
  if (!input.enabled) return { register: false, reason: 'mass_graduate_registration_disabled' }

  const ordered = [...input.artifacts]
    .filter(artifact => artifact.candidateId.startsWith('mass:') && artifact.status === 'runtime_pending' && HEX64.test(artifact.trainedArtifactHash))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))

  let reason = 'no_mass_artifact_eligible_for_graduation'
  for (const artifact of ordered) {
    const hash = artifact.trainedArtifactHash.toLowerCase()
    const mine = input.events.filter(event => event.candidateId === artifact.candidateId
      && String(event.evidence?.artifactHash || '').toLowerCase() === hash
      && event.evidence?.authorityExpanded !== true)

    const verdict = mine.find(event => event.verifier === 'independent_scorer' && event.evidence?.claim === 'independent_evaluation')
    if (!verdict) { reason = 'independent_verdict_missing'; continue }
    const baselineScore = numeric(verdict.evidence?.baselineScore)
    const trainedArtifactScore = numeric(verdict.evidence?.trainedArtifactScore)
    if (baselineScore === null || trainedArtifactScore === null) { reason = 'verdict_scores_missing'; continue }
    // A tie is not an improvement: only a strictly better holdout score graduates.
    if (!(trainedArtifactScore > baselineScore)) { reason = 'holdout_not_improved'; continue }
    if (!REQUIRED_CLAIMS.every(claim => mine.some(event => event.evidence?.claim === claim))) { reason = 'assurance_claims_incomplete'; continue }
    if (!mine.some(event => event.verifier === 'host_production_verifier'
      && event.evidence?.claim === 'production_canary_healthy'
      && event.evidence?.exactArtifact === true
      && event.evidence?.productionTrafficAuthorized === false)) { reason = 'exact_artifact_canary_missing'; continue }
    if (!artifact.trainedArtifactId || !artifact.studentModelId || !artifact.subjectId) { reason = 'artifact_identity_incomplete'; continue }
    if (!String(artifact.rollbackArtifactRef || '').trim()) { reason = 'rollback_reference_missing'; continue }

    return { register: true, artifact, baselineScore, trainedArtifactScore }
  }
  return { register: false, reason }
}
