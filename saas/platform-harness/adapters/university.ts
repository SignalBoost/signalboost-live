// saas/platform-harness/adapters/university.ts
//
// University consumes practical Harness evidence; it does not own the Harness.
// Residency teaches before independent final examinations. Hidden final-exam
// material must never be admitted into this adapter.

import { createHash } from 'node:crypto'
import type {
  HarnessManifest,
  HarnessRunResult,
} from '../core/types.ts'

export type UniversityHarnessCompetencyState =
  | 'supervised'
  | 'demonstrated'
  | 'retained'
  | 'remediation_required'

export interface UniversityResidencyCaseContext {
  candidateId: string
  subjectId: string
  caseFamily: string
  variantHash: string
  competencyId: string
  requestedState: Exclude<UniversityHarnessCompetencyState, 'remediation_required'>
  finalExamMaterialUsed: boolean
}

export interface UniversityHarnessEvidenceDecision {
  accepted: boolean
  route: 'competency_evidence' | 'remediation' | 'reject'
  competencyState: UniversityHarnessCompetencyState | 'unproven'
  evidenceHash: string | null
  blockers: readonly string[]
  promotionAuthorized: false
  productionTrafficAuthorized: false
}

const HEX64 = /^[a-f0-9]{64}$/i
const clean = (value: unknown, max = 240) => String(value ?? '').trim().slice(0, max)

function hashEvidence(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function observableTrajectoryHash(result: HarnessRunResult): string {
  return hashEvidence(result.trajectory.map(event => ({
    sequence: event.sequence,
    kind: event.kind,
    summary: event.summary,
    evidenceRefs: event.evidenceRefs ?? [],
    data: event.data ?? {},
  })))
}

/**
 * Convert a completed Residency HarnessRun into University-owned competency/remediation evidence.
 *
 * Deliberately absent: "independent final evaluation passed". Residency is practical education,
 * so final-exam success is not an admission prerequisite for practice evidence.
 */
export function adaptResidencyRunToUniversity(
  manifest: HarnessManifest,
  result: HarnessRunResult,
  context: UniversityResidencyCaseContext,
): UniversityHarnessEvidenceDecision {
  const blockers: string[] = []
  const candidateId = clean(context.candidateId)
  const subjectId = clean(context.subjectId, 160)
  const caseFamily = clean(context.caseFamily, 160)
  const competencyId = clean(context.competencyId, 160)
  const variantHash = clean(context.variantHash, 64).toLowerCase()
  const artifactHash = clean(manifest.identity.artifact?.artifactHash, 64).toLowerCase()

  if (manifest.profile !== 'residency') blockers.push('university_residency_profile_required')
  if (!manifest.learningFeedbackAllowed) blockers.push('university_residency_learning_feedback_disabled')
  if (!['synthetic', 'sandbox'].includes(manifest.environment.class)) {
    blockers.push('university_residency_nonproduction_environment_required')
  }
  if (!candidateId) blockers.push('university_residency_candidate_missing')
  if (!subjectId) blockers.push('university_residency_subject_missing')
  if (!caseFamily) blockers.push('university_residency_case_family_missing')
  if (!competencyId) blockers.push('university_residency_competency_missing')
  if (!HEX64.test(variantHash)) blockers.push('university_residency_variant_hash_invalid')
  if (!HEX64.test(artifactHash)) blockers.push('university_residency_exact_artifact_hash_required')
  if (context.finalExamMaterialUsed) blockers.push('university_residency_final_exam_material_forbidden')
  if (result.authorityExpanded) blockers.push('university_residency_authority_expansion_forbidden')
  if (result.productionMutationObserved) blockers.push('university_residency_production_mutation_forbidden')
  if (!['success', 'agent_failure'].includes(result.outcome.status)) {
    blockers.push('university_residency_outcome_not_competency_evidence')
  }

  if (blockers.length > 0) {
    return Object.freeze({
      accepted: false,
      route: 'reject',
      competencyState: 'unproven',
      evidenceHash: null,
      blockers: Object.freeze(blockers),
      promotionAuthorized: false,
      productionTrafficAuthorized: false,
    })
  }

  const remediation = result.outcome.status === 'agent_failure'
  const competencyState: UniversityHarnessCompetencyState = remediation
    ? 'remediation_required'
    : context.requestedState

  return Object.freeze({
    accepted: true,
    route: remediation ? 'remediation' : 'competency_evidence',
    competencyState,
    evidenceHash: hashEvidence({
      version: 'platform-harness-university-adapter-v1',
      runId: result.runId,
      candidateId,
      subjectId,
      caseFamily,
      competencyId,
      variantHash,
      artifactHash,
      competencyState,
      trajectoryHash: observableTrajectoryHash(result),
      verifierRef: result.outcome.verifierRef ?? null,
      outcome: result.outcome.status,
      finalExamMaterialUsed: false,
      authorityExpanded: false,
      productionMutationObserved: false,
    }),
    blockers: Object.freeze([]),
    promotionAuthorized: false,
    productionTrafficAuthorized: false,
  })
}
