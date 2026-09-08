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

export type CosUniversityMastersProgram = Readonly<{
  id: CosUniversityMastersProgramId
  title: string
  primarySubjects: readonly CosUniversitySubjectId[]
  admissionMinimumStanding: 'A'
  requiredEvidenceStages: readonly CosUniversityMastersEvidenceStage[]
  minimumDistinctIndependentPasses: number
  minimumDistinctTransferPasses: number
  minimumDistinctCapstonePasses: number
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
    minimumDistinctCapstonePasses: 2,
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
  stage: CosUniversityMastersEvidenceStage
  passed: boolean
  variantHash: string
  observedAt: string
  independent: boolean
  verifiedPractical?: boolean
}

function distinctPassesAfterLatestFailure(
  evidence: CosUniversityMastersEvidence[],
  stage: CosUniversityMastersEvidenceStage,
): number {
  const rows = evidence
    .filter(row => row.stage === stage && row.independent)
    .slice()
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt))
  let seen = new Set<string>()
  for (const row of rows) {
    if (!row.passed) {
      seen = new Set<string>()
      continue
    }
    seen.add(row.variantHash)
  }
  return seen.size
}

export type CosUniversityMastersGraduationDecision = {
  graduated: boolean
  blockers: string[]
  authorityExpanded: false
}

export function evaluateCosUniversityMastersGraduation(
  programId: CosUniversityMastersProgramId,
  evidence: CosUniversityMastersEvidence[],
): CosUniversityMastersGraduationDecision {
  const program = COS_UNIVERSITY_MASTERS_PROGRAMS[programId]
  const blockers: string[] = []
  const coursework = evidence.some(row => row.stage === 'graduate_coursework' && row.passed)
  if (!coursework) blockers.push('graduate_coursework_incomplete')
  if (distinctPassesAfterLatestFailure(evidence, 'independent_specialist_exam') < program.minimumDistinctIndependentPasses) blockers.push('independent_specialist_exam_incomplete')
  if (distinctPassesAfterLatestFailure(evidence, 'cross_domain_transfer') < program.minimumDistinctTransferPasses) blockers.push('cross_domain_transfer_incomplete')
  const practical = evidence.some(row => row.stage === 'verified_practical_work' && row.passed && row.verifiedPractical === true)
  if (!practical) blockers.push('verified_practical_work_incomplete')
  if (distinctPassesAfterLatestFailure(evidence, 'masters_capstone') < program.minimumDistinctCapstonePasses) blockers.push('masters_capstone_incomplete')
  return { graduated: blockers.length === 0, blockers, authorityExpanded: false }
}
