import type { SpecialistCompetencySnapshot, SoftwareCurriculumTrack } from './specialistLearning.ts'
import {
  COS_UNIVERSITY_GENERALIST_UNDERGRADUATE_CREDENTIAL_KEY,
  type CosUniversityCredential,
} from './cosUniversityCredentials.ts'
import {
  cosUniversityProgramMayGraduate,
  cosUniversityProgramTimingStatus,
  type CosUniversityProgramEnrollment,
} from './cosUniversityPrograms.ts'
import type {
  CosUniversityGrade,
  CosUniversitySubjectId,
  CosUniversityTranscriptEntry,
} from './cosUniversity.ts'

export const COS_UNIVERSITY_SOFTWARE_MASTERS_PROGRAM_KEY = 'software_engineering_masters_v1'
export const COS_UNIVERSITY_SOFTWARE_MASTERS_CREDENTIAL_KEY = 'cos_software_engineering_masters_v1'
export const COS_UNIVERSITY_SOFTWARE_MASTERS_TITLE = 'COS University Master of Software Engineering'
export const COS_UNIVERSITY_SOFTWARE_MASTERS_CAPSTONE_KEY = 'software_engineering_masters_capstone'
export const COS_UNIVERSITY_SOFTWARE_MASTERS_MINIMUM_CAPSTONE_PASSES = 2

export type CosUniversityGraduateAssessmentStage =
  | 'qualifying_exam'
  | 'applied_transfer'
  | 'production_transfer'
  | 'distinction'
  | 'capstone'

export type CosUniversityGraduateScorerAuthority =
  | 'host_private_exam'
  | 'verified_production'
  | 'host_capstone'

export type CosUniversityGraduateAssessmentEvidence = Readonly<{
  assessmentKey: string
  programKey: string
  programLevel: 'masters' | 'phd' | 'professional_certificate'
  specialistFamily: string
  competencyKey: string
  stage: CosUniversityGraduateAssessmentStage
  passed: boolean
  independentScorer: boolean
  scorerVersion: string
  scorerAuthority: CosUniversityGraduateScorerAuthority
  variantHash?: string | null
  observedAt: string
  validUntil: string
}>

export type SoftwareMastersCompetencyKey =
  | 'software.development'
  | 'software.debugging'
  | 'software.testing'
  | 'software.architecture'
  | 'software.delivery'
  | 'software.security'
  | 'software.technical-writing'

export type SoftwareMastersCompetency = Readonly<{
  key: SoftwareMastersCompetencyKey
  title: string
  curriculumTrack: SoftwareCurriculumTrack
  objective: string
}>

export const COS_UNIVERSITY_SOFTWARE_MASTERS_CURRICULUM: readonly SoftwareMastersCompetency[] = Object.freeze([
  {
    key: 'software.development',
    title: 'Advanced Software Development',
    curriculumTrack: 'software.development',
    objective: 'Design and implement robust software using appropriate algorithms, data structures, APIs, data models, and implementation techniques.',
  },
  {
    key: 'software.debugging',
    title: 'Debugging, Reliability & Failure Analysis',
    curriculumTrack: 'software.debugging',
    objective: 'Diagnose complex failures from evidence, isolate root causes, repair without masking symptoms, and prove reliability improvements.',
  },
  {
    key: 'software.testing',
    title: 'Testing & Verification Engineering',
    curriculumTrack: 'software.testing',
    objective: 'Design effective test strategies across unit, integration, end-to-end, regression, property, failure, and acceptance evidence.',
  },
  {
    key: 'software.architecture',
    title: 'Software Architecture & Distributed Systems',
    curriculumTrack: 'software.architecture',
    objective: 'Design evolvable systems with explicit tradeoffs across interfaces, data, concurrency, reliability, scale, and operational boundaries.',
  },
  {
    key: 'software.delivery',
    title: 'Delivery, Operations & Production Engineering',
    curriculumTrack: 'software.delivery',
    objective: 'Ship, observe, recover, and improve software safely using CI/CD, deployment evidence, observability, rollback, and operational discipline.',
  },
  {
    key: 'software.security',
    title: 'Secure Software Engineering',
    curriculumTrack: 'software.security',
    objective: 'Integrate threat modeling, secure design, identity, least privilege, vulnerability reasoning, and security verification into engineering work.',
  },
  {
    key: 'software.technical-writing',
    title: 'Technical Communication & Engineering Documentation',
    curriculumTrack: 'software.technical-writing',
    objective: 'Produce precise technical plans, design records, runbooks, explanations, and implementation evidence that another engineer can use and audit.',
  },
])

export const COS_UNIVERSITY_SOFTWARE_MASTERS_REQUIRED_UNDERGRAD_SUBJECTS: readonly CosUniversitySubjectId[] = Object.freeze([
  'computer_science',
  'mathematics',
  'cybersecurity',
  'reasoning_decision_science',
])

const GRADE_RANK: Record<CosUniversityGrade, number> = {
  unassessed: -1,
  F: 0,
  D: 1,
  C: 2,
  B: 3,
  'A-': 4,
  A: 5,
  'A+': 6,
}

function gradeAtLeastA(grade: CosUniversityGrade): boolean {
  return GRADE_RANK[grade] >= GRADE_RANK.A
}

function validTime(value: string): number | null {
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : null
}

function expectedAuthority(stage: CosUniversityGraduateAssessmentStage): CosUniversityGraduateScorerAuthority {
  if (stage === 'production_transfer') return 'verified_production'
  if (stage === 'capstone') return 'host_capstone'
  return 'host_private_exam'
}

function validGraduateEvidence(row: CosUniversityGraduateAssessmentEvidence, nowMs: number): boolean {
  const observedAt = validTime(row.observedAt)
  const validUntil = validTime(row.validUntil)
  return Boolean(
    String(row.assessmentKey || '').trim()
    && row.programKey === COS_UNIVERSITY_SOFTWARE_MASTERS_PROGRAM_KEY
    && row.programLevel === 'masters'
    && row.specialistFamily === 'software'
    && String(row.competencyKey || '').trim()
    && String(row.scorerVersion || '').trim()
    && row.independentScorer === true
    && row.scorerAuthority === expectedAuthority(row.stage)
    && observedAt
    && validUntil
    && validUntil > nowMs
    && validUntil > observedAt,
  )
}

function latestStage(
  rows: CosUniversityGraduateAssessmentEvidence[],
  stage: CosUniversityGraduateAssessmentStage,
): CosUniversityGraduateAssessmentEvidence | null {
  return rows
    .filter(row => row.stage === stage)
    .slice()
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0] ?? null
}

export type SoftwareMastersAdmissionStatus = Readonly<{
  admitted: boolean
  blockers: string[]
  authorityExpanded: false
  semantics: 'undergraduate_credential_plus_current_prerequisites_plus_real_specialist_evidence'
}>

export function evaluateSoftwareMastersAdmission(args: {
  credentials: CosUniversityCredential[]
  subjectTranscript: CosUniversityTranscriptEntry[]
  specialistSnapshot: SpecialistCompetencySnapshot | null
}): SoftwareMastersAdmissionStatus {
  const blockers: string[] = []
  const undergraduate = args.credentials.find(credential =>
    credential.credentialKey === COS_UNIVERSITY_GENERALIST_UNDERGRADUATE_CREDENTIAL_KEY
    && credential.programLevel === 'undergraduate',
  )
  if (!undergraduate) blockers.push('generalist_undergraduate_credential_required')

  const transcript = new Map(args.subjectTranscript.map(row => [row.subjectId, row] as const))
  for (const subjectId of COS_UNIVERSITY_SOFTWARE_MASTERS_REQUIRED_UNDERGRAD_SUBJECTS) {
    const grade = transcript.get(subjectId)?.grade ?? 'unassessed'
    if (!gradeAtLeastA(grade)) blockers.push(`current_undergraduate_${subjectId}_A_required`)
  }

  const specialist = args.specialistSnapshot
  if (!specialist || specialist.specialistFamily !== 'software' || specialist.freshValidatedSkills < 1) {
    blockers.push('fresh_validated_software_specialist_evidence_required')
  }

  return {
    admitted: blockers.length === 0,
    blockers,
    authorityExpanded: false,
    semantics: 'undergraduate_credential_plus_current_prerequisites_plus_real_specialist_evidence',
  }
}

export type SoftwareMastersCompetencyStanding = Readonly<{
  competencyKey: SoftwareMastersCompetencyKey
  title: string
  grade: 'unassessed' | 'B' | 'A-' | 'A' | 'A+'
  qualifyingExamPassed: boolean
  appliedTransferPassed: boolean
  productionTransferPassed: boolean
  distinctionPassed: boolean
  evidenceCount: number
  latestAssessmentAt: string | null
}>

export function deriveSoftwareMastersCompetencyStanding(
  competency: SoftwareMastersCompetency,
  evidence: CosUniversityGraduateAssessmentEvidence[],
  now = new Date(),
): SoftwareMastersCompetencyStanding {
  const rows = evidence.filter(row =>
    row.competencyKey === competency.key && validGraduateEvidence(row, now.getTime()),
  )
  const qualifyingExamPassed = latestStage(rows, 'qualifying_exam')?.passed === true
  const appliedTransferPassed = qualifyingExamPassed && latestStage(rows, 'applied_transfer')?.passed === true
  const productionTransferPassed = appliedTransferPassed && latestStage(rows, 'production_transfer')?.passed === true
  const distinctionPassed = productionTransferPassed && latestStage(rows, 'distinction')?.passed === true
  const latest = rows
    .slice()
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0]

  let grade: SoftwareMastersCompetencyStanding['grade'] = 'unassessed'
  if (distinctionPassed) grade = 'A+'
  else if (productionTransferPassed) grade = 'A'
  else if (appliedTransferPassed) grade = 'A-'
  else if (qualifyingExamPassed) grade = 'B'

  return {
    competencyKey: competency.key,
    title: competency.title,
    grade,
    qualifyingExamPassed,
    appliedTransferPassed,
    productionTransferPassed,
    distinctionPassed,
    evidenceCount: rows.length,
    latestAssessmentAt: latest?.observedAt ?? null,
  }
}

export function softwareMastersCapstonePassesSinceLatestFailure(
  evidence: CosUniversityGraduateAssessmentEvidence[],
  now = new Date(),
): number {
  const rows = evidence
    .filter(row => row.competencyKey === COS_UNIVERSITY_SOFTWARE_MASTERS_CAPSTONE_KEY)
    .filter(row => row.stage === 'capstone' && validGraduateEvidence(row, now.getTime()))
    .slice()
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt))
  let variants = new Set<string>()
  for (const row of rows) {
    if (!row.passed) {
      variants = new Set<string>()
      continue
    }
    const variant = String(row.variantHash || '').trim()
    if (variant) variants.add(variant)
  }
  return variants.size
}

export type SoftwareMastersGraduationStatus = Readonly<{
  programKey: typeof COS_UNIVERSITY_SOFTWARE_MASTERS_PROGRAM_KEY
  enrolled: boolean
  timingStatus: ReturnType<typeof cosUniversityProgramTimingStatus>
  minimumResidenceSatisfied: boolean
  deadlineExpired: boolean
  competencyStanding: SoftwareMastersCompetencyStanding[]
  competencyBlockers: SoftwareMastersCompetencyKey[]
  capstoneDistinctPasses: number
  capstonePassed: boolean
  graduationReady: boolean
  standing: 'not_graduated' | 'A' | 'A+'
  authorityExpanded: false
  semantics: 'graduate_depth_requires_exam_transfer_production_and_capstone'
}>

export function deriveSoftwareMastersGraduationStatus(args: {
  enrollment: CosUniversityProgramEnrollment | null
  evidence: CosUniversityGraduateAssessmentEvidence[]
  now?: Date
}): SoftwareMastersGraduationStatus {
  const now = args.now instanceof Date ? args.now : new Date()
  const enrollment = args.enrollment?.programKey === COS_UNIVERSITY_SOFTWARE_MASTERS_PROGRAM_KEY
    && args.enrollment.programLevel === 'masters'
    ? args.enrollment
    : null
  const timingStatus = cosUniversityProgramTimingStatus(enrollment, now)
  const minimumResidenceSatisfied = timingStatus === 'on_schedule'
    || timingStatus === 'target_date_passed'
    || timingStatus === 'deadline_expired'
  const deadlineExpired = timingStatus === 'deadline_expired'
  const competencyStanding = COS_UNIVERSITY_SOFTWARE_MASTERS_CURRICULUM.map(competency =>
    deriveSoftwareMastersCompetencyStanding(competency, args.evidence, now),
  )
  const competencyBlockers = competencyStanding
    .filter(row => row.grade !== 'A' && row.grade !== 'A+')
    .map(row => row.competencyKey)
  const capstoneDistinctPasses = softwareMastersCapstonePassesSinceLatestFailure(args.evidence, now)
  const capstonePassed = capstoneDistinctPasses >= COS_UNIVERSITY_SOFTWARE_MASTERS_MINIMUM_CAPSTONE_PASSES
  const graduationReady = Boolean(
    enrollment
    && cosUniversityProgramMayGraduate(enrollment, now)
    && competencyBlockers.length === 0
    && capstonePassed,
  )
  const allDistinction = competencyStanding.every(row => row.grade === 'A+')

  return {
    programKey: COS_UNIVERSITY_SOFTWARE_MASTERS_PROGRAM_KEY,
    enrolled: Boolean(enrollment),
    timingStatus,
    minimumResidenceSatisfied,
    deadlineExpired,
    competencyStanding,
    competencyBlockers,
    capstoneDistinctPasses,
    capstonePassed,
    graduationReady,
    standing: graduationReady ? (allDistinction ? 'A+' : 'A') : 'not_graduated',
    authorityExpanded: false,
    semantics: 'graduate_depth_requires_exam_transfer_production_and_capstone',
  }
}
