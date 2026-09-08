// saas/lib/ai/cos/cosUniversityMasters.ts
// Canonical Master's specialization catalog plus evidence-backed degree semantics.

import type { CosUniversitySubjectId } from './cosUniversity.ts'

export type CosUniversityMastersTrackId =
  | 'applied_ai_systems'
  | 'security_and_trust'
  | 'quantitative_decision_science'
  | 'enterprise_operations_and_governance'
  | 'scientific_and_physical_systems'

export type CosUniversityMastersProgramId = CosUniversityMastersTrackId

export type CosUniversityMastersEvidenceStage =
  | 'graduate_coursework'
  | 'independent_specialist_exam'
  | 'cross_domain_transfer'
  | 'verified_practical_work'
  | 'masters_capstone'

export type CosUniversityMastersEvidenceAuthority =
  | 'university_coursework'
  | 'host_private_exam'
  | 'verified_production'
  | 'host_capstone'

export type CosUniversityMastersTrack = Readonly<{
  id: CosUniversityMastersTrackId
  title: string
  objective: string
  coreSubjects: readonly CosUniversitySubjectId[]
  supportingSubjects: readonly CosUniversitySubjectId[]
  requiredDepthPasses: number
}>

export const COS_UNIVERSITY_MASTERS_TRACKS: ReadonlyArray<CosUniversityMastersTrack> = Object.freeze([
  Object.freeze({
    id: 'applied_ai_systems',
    title: 'Applied AI Systems',
    objective: 'Design, evaluate, and operate AI systems end to end, including failure analysis and evaluation design.',
    coreSubjects: Object.freeze(['computer_science', 'statistics_data_science'] as const),
    supportingSubjects: Object.freeze(['mathematics', 'reasoning_decision_science'] as const),
    requiredDepthPasses: 3,
  }),
  Object.freeze({
    id: 'security_and_trust',
    title: 'Security & Trust Engineering',
    objective: 'Reason adversarially about systems, identity, and incidents, and defend designs under hostile assumptions.',
    coreSubjects: Object.freeze(['cybersecurity', 'computer_science'] as const),
    supportingSubjects: Object.freeze(['law_regulation_governance', 'reasoning_decision_science'] as const),
    requiredDepthPasses: 3,
  }),
  Object.freeze({
    id: 'quantitative_decision_science',
    title: 'Quantitative Decision Science',
    objective: 'Draw defensible conclusions from data under uncertainty and state what the evidence cannot support.',
    coreSubjects: Object.freeze(['statistics_data_science', 'mathematics'] as const),
    supportingSubjects: Object.freeze(['economics_finance', 'reasoning_decision_science'] as const),
    requiredDepthPasses: 3,
  }),
  Object.freeze({
    id: 'enterprise_operations_and_governance',
    title: 'Enterprise Operations & Governance',
    objective: 'Run and govern operating businesses: process, control, regulation, and accountable decision records.',
    coreSubjects: Object.freeze(['business_operations', 'law_regulation_governance'] as const),
    supportingSubjects: Object.freeze(['economics_finance', 'social_behavioral_sciences'] as const),
    requiredDepthPasses: 3,
  }),
  Object.freeze({
    id: 'scientific_and_physical_systems',
    title: 'Scientific & Physical Systems',
    objective: 'Apply scientific method and physical reasoning to instrumented real-world systems.',
    coreSubjects: Object.freeze(['physics_natural_sciences', 'mathematics'] as const),
    supportingSubjects: Object.freeze(['statistics_data_science', 'computer_science'] as const),
    requiredDepthPasses: 3,
  }),
])

export function cosUniversityMastersTrackById(id: string): CosUniversityMastersTrack | null {
  return COS_UNIVERSITY_MASTERS_TRACKS.find((track) => track.id === id) ?? null
}

export function cosUniversityMastersProgramKey(trackId: CosUniversityMastersTrackId): string {
  return `specialist_masters_${trackId}_v1`
}

export const COS_UNIVERSITY_MASTERS_PROGRAM_KEY_PREFIX = 'specialist_masters_'

export function rankCosUniversityMastersTracks(
  subjectStanding: ReadonlyMap<CosUniversitySubjectId, number>,
): ReadonlyArray<{ track: CosUniversityMastersTrack; score: number }> {
  return COS_UNIVERSITY_MASTERS_TRACKS
    .map((track, index) => {
      const core = track.coreSubjects.reduce((sum, id) => sum + (subjectStanding.get(id) ?? 0), 0)
      const supporting = track.supportingSubjects.reduce((sum, id) => sum + (subjectStanding.get(id) ?? 0), 0)
      const denominator = track.coreSubjects.length + track.supportingSubjects.length * 0.5
      const score = denominator > 0 ? (core + supporting * 0.5) / denominator : 0
      return { track, score, index }
    })
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .map(({ track, score }) => ({ track, score }))
}

export type CosUniversityMastersProgram = Readonly<{
  id: CosUniversityMastersProgramId
  title: string
  primarySubjects: readonly CosUniversitySubjectId[]
  admissionMinimumStanding: 'A'
  requiredEvidenceStages: readonly CosUniversityMastersEvidenceStage[]
  minimumDistinctIndependentPasses: number
  minimumDistinctTransferPasses: number
  minimumDistinctPracticalPasses: number
  minimumDistinctCapstonePasses: number
  aPlusDistinctIndependentPasses: number
  aPlusDistinctTransferPasses: number
  aPlusDistinctPracticalPasses: number
  aPlusDistinctCapstonePasses: number
}>

const STANDARD_EVIDENCE: readonly CosUniversityMastersEvidenceStage[] = Object.freeze([
  'graduate_coursework',
  'independent_specialist_exam',
  'cross_domain_transfer',
  'verified_practical_work',
  'masters_capstone',
])

function academicProgram(track: CosUniversityMastersTrack): CosUniversityMastersProgram {
  return Object.freeze({
    id: track.id,
    title: `Master of ${track.title}`,
    primarySubjects: track.coreSubjects,
    admissionMinimumStanding: 'A' as const,
    requiredEvidenceStages: STANDARD_EVIDENCE,
    minimumDistinctIndependentPasses: Math.max(2, track.requiredDepthPasses),
    minimumDistinctTransferPasses: 2,
    minimumDistinctPracticalPasses: 1,
    minimumDistinctCapstonePasses: 2,
    aPlusDistinctIndependentPasses: Math.max(4, track.requiredDepthPasses + 1),
    aPlusDistinctTransferPasses: 3,
    aPlusDistinctPracticalPasses: 2,
    aPlusDistinctCapstonePasses: 3,
  })
}

export const COS_UNIVERSITY_MASTERS_PROGRAMS: Readonly<Record<CosUniversityMastersProgramId, CosUniversityMastersProgram>> = Object.freeze(
  Object.fromEntries(COS_UNIVERSITY_MASTERS_TRACKS.map(track => [track.id, academicProgram(track)])) as Record<CosUniversityMastersProgramId, CosUniversityMastersProgram>,
)

export function cosUniversityMastersCredentialKey(agentId: string, programId: CosUniversityMastersProgramId): string {
  return `${String(agentId || '').trim()}:masters:${programId}:v1`
}

export function cosUniversityMastersExpectedAuthority(stage: CosUniversityMastersEvidenceStage): CosUniversityMastersEvidenceAuthority {
  if (stage === 'graduate_coursework') return 'university_coursework'
  if (stage === 'verified_practical_work') return 'verified_production'
  if (stage === 'masters_capstone') return 'host_capstone'
  return 'host_private_exam'
}

export type CosUniversityMastersAdmissionInput = {
  undergraduateCredentialAwarded: boolean
  currentGeneralistStanding: 'not_graduated' | 'A' | 'A+'
  currentSubjectStanding: Partial<Record<CosUniversitySubjectId, string>>
}

export type CosUniversityMastersAdmissionDecision = {
  admitted: boolean
  reasons: string[]
}

export function evaluateCosUniversityMastersAdmission(
  programId: CosUniversityMastersProgramId,
  input: CosUniversityMastersAdmissionInput,
): CosUniversityMastersAdmissionDecision {
  const program = COS_UNIVERSITY_MASTERS_PROGRAMS[programId]
  const reasons: string[] = []
  if (!input.undergraduateCredentialAwarded) reasons.push('undergraduate_credential_required')
  if (input.currentGeneralistStanding !== 'A' && input.currentGeneralistStanding !== 'A+') reasons.push('current_generalist_A_required')
  for (const subjectId of program.primarySubjects) {
    const standing = input.currentSubjectStanding[subjectId]
    if (standing !== 'A' && standing !== 'A+') reasons.push(`subject_A_required:${subjectId}`)
  }
  return { admitted: reasons.length === 0, reasons }
}

export type CosUniversityMastersEvidence = {
  programId: CosUniversityMastersProgramId
  stage: CosUniversityMastersEvidenceStage
  passed: boolean
  variantHash: string
  observedAt: string
  validUntil: string
  independent: boolean
  authority: CosUniversityMastersEvidenceAuthority
  verifiedPractical?: boolean
}

function validTime(value: string): number | null {
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : null
}

export function cosUniversityMastersEvidenceEligible(
  row: CosUniversityMastersEvidence,
  now = new Date(),
): boolean {
  const observedAt = validTime(row.observedAt)
  const validUntil = validTime(row.validUntil)
  const variantHash = String(row.variantHash || '').trim()
  if (!variantHash || !observedAt || !validUntil || validUntil <= observedAt || validUntil <= now.getTime()) return false
  if (!COS_UNIVERSITY_MASTERS_PROGRAMS[row.programId]) return false
  if (row.authority !== cosUniversityMastersExpectedAuthority(row.stage)) return false
  if (row.stage !== 'graduate_coursework' && !row.independent) return false
  if (row.stage === 'verified_practical_work' && row.verifiedPractical !== true) return false
  return true
}

function eligibleStageRows(
  evidence: CosUniversityMastersEvidence[],
  programId: CosUniversityMastersProgramId,
  stage: CosUniversityMastersEvidenceStage,
  now: Date,
): CosUniversityMastersEvidence[] {
  return evidence
    .filter(row => row.programId === programId && row.stage === stage && cosUniversityMastersEvidenceEligible(row, now))
    .slice()
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt))
}

export function cosUniversityMastersDistinctPassesAfterLatestFailure(
  evidence: CosUniversityMastersEvidence[],
  programId: CosUniversityMastersProgramId,
  stage: CosUniversityMastersEvidenceStage,
  now = new Date(),
): number {
  const rows = eligibleStageRows(evidence, programId, stage, now)
  let seen = new Set<string>()
  for (const row of rows) {
    if (!row.passed) {
      seen = new Set<string>()
      continue
    }
    seen.add(String(row.variantHash).trim())
  }
  return seen.size
}

export type CosUniversityMastersGraduationDecision = {
  graduated: boolean
  standing: 'not_graduated' | 'A' | 'A+'
  blockers: string[]
  authorityExpanded: false
}

export function evaluateCosUniversityMastersGraduation(
  programId: CosUniversityMastersProgramId,
  evidence: CosUniversityMastersEvidence[],
  now = new Date(),
): CosUniversityMastersGraduationDecision {
  const program = COS_UNIVERSITY_MASTERS_PROGRAMS[programId]
  const blockers: string[] = []
  const coursework = eligibleStageRows(evidence, programId, 'graduate_coursework', now).some(row => row.passed)
  const independentPasses = cosUniversityMastersDistinctPassesAfterLatestFailure(evidence, programId, 'independent_specialist_exam', now)
  const transferPasses = cosUniversityMastersDistinctPassesAfterLatestFailure(evidence, programId, 'cross_domain_transfer', now)
  const practicalPasses = cosUniversityMastersDistinctPassesAfterLatestFailure(evidence, programId, 'verified_practical_work', now)
  const capstonePasses = cosUniversityMastersDistinctPassesAfterLatestFailure(evidence, programId, 'masters_capstone', now)

  if (!coursework) blockers.push('graduate_coursework_incomplete')
  if (independentPasses < program.minimumDistinctIndependentPasses) blockers.push('independent_specialist_exam_incomplete')
  if (transferPasses < program.minimumDistinctTransferPasses) blockers.push('cross_domain_transfer_incomplete')
  if (practicalPasses < program.minimumDistinctPracticalPasses) blockers.push('verified_practical_work_incomplete')
  if (capstonePasses < program.minimumDistinctCapstonePasses) blockers.push('masters_capstone_incomplete')

  if (blockers.length) return { graduated: false, standing: 'not_graduated', blockers, authorityExpanded: false }
  const aPlus = independentPasses >= program.aPlusDistinctIndependentPasses
    && transferPasses >= program.aPlusDistinctTransferPasses
    && practicalPasses >= program.aPlusDistinctPracticalPasses
    && capstonePasses >= program.aPlusDistinctCapstonePasses
  return { graduated: true, standing: aPlus ? 'A+' : 'A', blockers: [], authorityExpanded: false }
}
