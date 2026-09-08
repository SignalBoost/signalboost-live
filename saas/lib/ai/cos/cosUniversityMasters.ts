import type { CosUniversitySubjectId } from './cosUniversity.ts'

export type CosUniversityMastersProgramId =
  | 'software_engineering'
  | 'cybersecurity'
  | 'mathematics'
  | 'statistics_data_science'
  | 'finance_economics'
  | 'international_relations'
  | 'business_operations'
  | 'legal_regulatory_analysis'
  | 'engineering_physical_sciences'
  | 'social_behavioral_sciences'
  | 'language_communication'

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

function program(
  id: CosUniversityMastersProgramId,
  title: string,
  primarySubjects: readonly CosUniversitySubjectId[],
): CosUniversityMastersProgram {
  return Object.freeze({
    id,
    title,
    primarySubjects: Object.freeze([...primarySubjects]),
    admissionMinimumStanding: 'A' as const,
    requiredEvidenceStages: STANDARD_EVIDENCE,
    minimumDistinctIndependentPasses: 2,
    minimumDistinctTransferPasses: 2,
    minimumDistinctPracticalPasses: 1,
    minimumDistinctCapstonePasses: 2,
    aPlusDistinctIndependentPasses: 3,
    aPlusDistinctTransferPasses: 3,
    aPlusDistinctPracticalPasses: 2,
    aPlusDistinctCapstonePasses: 3,
  })
}

export const COS_UNIVERSITY_MASTERS_PROGRAMS: Readonly<Record<CosUniversityMastersProgramId, CosUniversityMastersProgram>> = Object.freeze({
  software_engineering: program('software_engineering', 'Master of Software Engineering', ['computer_science', 'reasoning_decision_science', 'business_operations']),
  cybersecurity: program('cybersecurity', 'Master of Cybersecurity', ['cybersecurity', 'computer_science', 'law_regulation_governance']),
  mathematics: program('mathematics', 'Master of Mathematics', ['mathematics', 'reasoning_decision_science']),
  statistics_data_science: program('statistics_data_science', 'Master of Statistics & Data Science', ['statistics_data_science', 'mathematics', 'reasoning_decision_science']),
  finance_economics: program('finance_economics', 'Master of Finance & Economics', ['economics_finance', 'statistics_data_science', 'business_operations']),
  international_relations: program('international_relations', 'Master of International Relations', ['politics_government_international_relations', 'history_culture_philosophy_religion', 'law_regulation_governance']),
  business_operations: program('business_operations', 'Master of Business & Operations', ['business_operations', 'economics_finance', 'social_behavioral_sciences']),
  legal_regulatory_analysis: program('legal_regulatory_analysis', 'Master of Legal & Regulatory Analysis', ['law_regulation_governance', 'politics_government_international_relations', 'reasoning_decision_science']),
  engineering_physical_sciences: program('engineering_physical_sciences', 'Master of Engineering & Physical Sciences', ['physics_natural_sciences', 'mathematics', 'computer_science']),
  social_behavioral_sciences: program('social_behavioral_sciences', 'Master of Social & Behavioral Sciences', ['social_behavioral_sciences', 'statistics_data_science', 'history_culture_philosophy_religion']),
  language_communication: program('language_communication', 'Master of Language & Communication', ['language_communication', 'social_behavioral_sciences', 'history_culture_philosophy_religion']),
})

export function cosUniversityMastersProgramKey(programId: CosUniversityMastersProgramId): string {
  return `masters:${programId}:v1`
}

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
