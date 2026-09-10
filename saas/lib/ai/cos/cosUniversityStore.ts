import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import type { KnowledgeGapSignal } from '@/lib/cos-core/layers/learning/gaps'
import {
  buildCosUniversityTranscript,
  classifyCosUniversitySubjects,
  cosUniversitySubjectById,
  type CosUniversityAssessmentEvidence,
  type CosUniversityAssessmentKind,
  type CosUniversitySubjectId,
  type CosUniversityTranscriptEntry,
} from './cosUniversity.ts'
import {
  buildCosPlatformLanguageTranscript,
  type CosPlatformLanguage,
  type CosPlatformLanguageAssessmentEvidence,
  type CosPlatformLanguageDimension,
  type CosPlatformLanguageTranscriptEntry,
} from './cosUniversityLanguages.ts'
import {
  detectPlatformLanguages,
  platformLanguageStudyGapSignal,
  rotatingPlatformLanguageTarget,
  rotatingUniversitySubjectTarget,
  selectCosUniversityStudyStrategy,
  universityStudyGapSignal,
  type CosUniversityFailureClass,
  type CosUniversityStudyStrategy,
} from './cosUniversityStudyStrategy.ts'

const AGENT_ID = 'cos'
const VALID_SCORER_AUTHORITIES = new Set(['host_private_exam', 'verified_production', 'host_capstone'])
const AUTOPSY_STATUSES = ['retest_pending', 'retest_failed', 'insufficient_evidence'] as const

export type CosUniversityScorerAuthority = 'host_private_exam' | 'verified_production' | 'host_capstone'

export type RecordCosUniversityAssessmentInput = {
  assessmentKey: string
  subjectId?: CosUniversitySubjectId
  language?: CosPlatformLanguage
  languageDimension?: CosPlatformLanguageDimension
  kind: CosUniversityAssessmentKind
  passed: boolean
  independentScorer: true
  scorerVersion: string
  scorerAuthority: CosUniversityScorerAuthority
  sourceRef?: string | null
  evidence?: Record<string, unknown>
  observedAt: string
  validUntil: string
}

export type CosUniversityAcademicState = {
  subjectTranscript: CosUniversityTranscriptEntry[]
  languageTranscript: CosPlatformLanguageTranscriptEntry[]
  assessmentRows: number
  semantics: 'fresh_independent_assessment_evidence_only'
}

export type CosUniversityStudyPlanRow = {
  id: string
  plan_key: string
  subject_id: CosUniversitySubjectId
  language_code: CosPlatformLanguage | null
  language_dimension: CosPlatformLanguageDimension | null
  failure_class: CosUniversityFailureClass
  target_grade: 'A' | 'A+'
  source_kind: 'failure_autopsy' | 'operational_weakness' | 'academic_rotation' | 'language_rotation' | 'recertification'
  source_ref: string | null
  problem_class: string | null
  objective: string
  methods: unknown
  acquisition_source_kinds: unknown
  fine_tune_candidate: boolean
  priority: number
  status: 'queued' | 'studying' | 'ready_for_exam' | 'completed' | 'superseded'
  attempt_count: number
  last_seen_at: string
  last_attempt_at: string | null
  created_at: string
  updated_at: string
}

export type CosUniversityPlanningCycleSummary = {
  ok: boolean
  academicState: CosUniversityAcademicState | null
  consideredFailures: number
  activePlans: Array<{
    id: string
    planKey: string
    subjectId: CosUniversitySubjectId
    language: CosPlatformLanguage | null
    failureClass: CosUniversityFailureClass
    sourceKind: CosUniversityStudyPlanRow['source_kind']
    objective: string
    priority: number
    methods: CosUniversityStudyStrategy['methods']
    acquisitionSourceKinds: CosUniversityStudyStrategy['acquisitionSourceKinds']
    learningDesign: CosUniversityStudyStrategy['learningDesign']
    fineTuneCandidate: boolean
  }>
  gapSignals: KnowledgeGapSignal[]
  errors: string[]
}

type AssessmentRow = {
  assessment_key: string
  subject_id: CosUniversitySubjectId | null
  language_code: CosPlatformLanguage | null
  language_dimension: CosPlatformLanguageDimension | null
  assessment_kind: CosUniversityAssessmentKind
  passed: boolean
  independent_scorer: boolean
  scorer_version: string
  scorer_authority: CosUniversityScorerAuthority
  observed_at: string
  valid_until: string
}

type FailureAutopsyPlanningRow = {
  id: string
  turn_id: string
  problem_class: string
  primary_stage: string | null
  corrective_guidance: string | null
  status: string
  updated_at: string
}

function clean(value: unknown, max = 2000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function validTime(value: string): number | null {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function dayNumber(date: Date): number {
  return Math.floor(date.getTime() / 86_400_000)
}

function planKey(parts: Array<string | null | undefined>): string {
  return createHash('sha256').update(parts.map(part => clean(part, 500)).join('|')).digest('hex')
}

function failureClassFromAutopsyStage(stage: unknown): CosUniversityFailureClass {
  const value = clean(stage, 80)
  if (value === 'retrieval') return 'retrieval'
  if (value === 'evidence_selection') return 'evidence_selection'
  if (value === 'grounding') return 'grounding'
  if (value === 'stale_or_missing_knowledge') return 'stale_or_missing_knowledge'
  if (value === 'calibration') return 'calibration'
  if (value === 'tool_execution') return 'tool_execution'
  if (value === 'reasoning') return 'reasoning'
  return 'unknown'
}

function defaultSubjectForFailureClass(failureClass: CosUniversityFailureClass): CosUniversitySubjectId {
  return failureClass === 'tool_execution' ? 'computer_science' : 'reasoning_decision_science'
}

function gradeEligible(row: AssessmentRow, nowMs: number): boolean {
  const validUntil = validTime(row.valid_until)
  const observedAt = validTime(row.observed_at)
  if (!row.independent_scorer || !VALID_SCORER_AUTHORITIES.has(row.scorer_authority)) return false
  if (!validUntil || !observedAt || validUntil <= nowMs || validUntil <= observedAt) return false
  if (row.assessment_kind === 'production_transfer' && row.scorer_authority !== 'verified_production') return false
  if (row.assessment_kind === 'capstone' && row.scorer_authority !== 'host_capstone') return false
  return true
}

export function academicStateFromRows(rows: AssessmentRow[], now = new Date()): CosUniversityAcademicState {
  const nowMs = now.getTime()
  const subjectEvidence: CosUniversityAssessmentEvidence[] = []
  const languageEvidence: CosPlatformLanguageAssessmentEvidence[] = []

  for (const row of rows) {
    if (!gradeEligible(row, nowMs)) continue
    if (row.subject_id) {
      subjectEvidence.push({
        assessmentId: row.assessment_key,
        subjectId: row.subject_id,
        kind: row.assessment_kind,
        passed: row.passed,
        independentScorer: true,
        fresh: true,
        scorerVersion: row.scorer_version,
        observedAt: row.observed_at,
      })
      continue
    }
    if (row.language_code && row.language_dimension) {
      languageEvidence.push({
        assessmentId: row.assessment_key,
        language: row.language_code,
        dimension: row.language_dimension,
        kind: row.assessment_kind,
        passed: row.passed,
        independentScorer: true,
        fresh: true,
        scorerVersion: row.scorer_version,
        observedAt: row.observed_at,
      })
    }
  }

  return {
    subjectTranscript: buildCosUniversityTranscript(subjectEvidence),
    languageTranscript: buildCosPlatformLanguageTranscript(languageEvidence),
    assessmentRows: rows.length,
    semantics: 'fresh_independent_assessment_evidence_only',
  }
}

export async function readCosUniversityAcademicState(now = new Date()): Promise<CosUniversityAcademicState | null> {
  const db = cosServiceDb()
  if (!db) return null
  const result = await db.from('cos_university_assessments')
    .select('assessment_key,subject_id,language_code,language_dimension,assessment_kind,passed,independent_scorer,scorer_version,scorer_authority,observed_at,valid_until')
    .eq('agent_id', AGENT_ID)
    .order('observed_at', { ascending: false })
    .limit(2500)
  if (result.error) throw result.error
  return academicStateFromRows((result.data || []) as AssessmentRow[], now)
}

/**
 * The durable ledger accepts evidence, never a caller-supplied letter grade. Freshness is derived
 * later from valid_until. Independent-scorer and authority requirements are checked again here even
 * though the database also has fail-closed constraints.
 */
export async function recordCosUniversityAssessment(input: RecordCosUniversityAssessmentInput): Promise<boolean> {
  const db = cosServiceDb()
  if (!db) return false
  const key = clean(input.assessmentKey, 300)
  const scorerVersion = clean(input.scorerVersion, 180)
  if (!key || !scorerVersion || input.independentScorer !== true) return false
  if (!VALID_SCORER_AUTHORITIES.has(input.scorerAuthority)) return false
  if (input.kind === 'production_transfer' && input.scorerAuthority !== 'verified_production') return false
  if (input.kind === 'capstone' && input.scorerAuthority !== 'host_capstone') return false
  const observedAt = validTime(input.observedAt)
  const validUntil = validTime(input.validUntil)
  if (!observedAt || !validUntil || validUntil <= observedAt) return false

  const hasSubject = Boolean(input.subjectId)
  const hasLanguage = Boolean(input.language && input.languageDimension)
  if (hasSubject === hasLanguage) return false

  const result = await db.from('cos_university_assessments').upsert({
    assessment_key: key,
    agent_id: AGENT_ID,
    subject_id: input.subjectId || null,
    language_code: input.language || null,
    language_dimension: input.languageDimension || null,
    assessment_kind: input.kind,
    passed: input.passed,
    independent_scorer: true,
    scorer_version: scorerVersion,
    scorer_authority: input.scorerAuthority,
    source_ref: clean(input.sourceRef, 700) || null,
    evidence: input.evidence || {},
    observed_at: new Date(observedAt).toISOString(),
    valid_until: new Date(validUntil).toISOString(),
  }, { onConflict: 'assessment_key', ignoreDuplicates: true })
  if (result.error) throw result.error
  return true
}

async function loadUnresolvedFailureAutopsies(limit = 24): Promise<FailureAutopsyPlanningRow[]> {
  const db = cosServiceDb()
  if (!db) return []
  const result = await db.from('cos_turn_failure_autopsies')
    .select('id,turn_id,problem_class,primary_stage,corrective_guidance,status,updated_at')
    .in('status', [...AUTOPSY_STATUSES])
    .order('updated_at', { ascending: false })
    .limit(Math.max(1, Math.min(100, Math.floor(limit))))
  if (result.error) throw result.error
  return (result.data || []) as FailureAutopsyPlanningRow[]
}

type PlanCandidate = {
  planKey: string
  subjectId: CosUniversitySubjectId
  language: CosPlatformLanguage | null
  languageDimension: CosPlatformLanguageDimension | null
  failureClass: CosUniversityFailureClass
  sourceKind: CosUniversityStudyPlanRow['source_kind']
  sourceRef: string | null
  problemClass: string | null
  objective: string
  strategy: CosUniversityStudyStrategy
  priority: number
  repeatedCount: number
  evidence: Record<string, unknown>
}

function autopsyCandidates(row: FailureAutopsyPlanningRow): PlanCandidate[] {
  const failureClass = failureClassFromAutopsyStage(row.primary_stage)
  const problemClass = clean(row.problem_class, 500) || 'general reasoning'
  const guidance = clean(row.corrective_guidance, 1200)
  const classified = classifyCosUniversitySubjects(problemClass)
  const subjects = classified.length ? classified : [defaultSubjectForFailureClass(failureClass)]
  const languages = detectPlatformLanguages(`${problemClass} ${guidance}`)
  const repeatedFailures = row.status === 'retest_failed' ? 2 : 1
  const independentRetestFailures = row.status === 'retest_failed' ? 1 : 0
  const strategy = selectCosUniversityStudyStrategy({ failureClass, repeatedFailures, independentRetestFailures })
  const objective = guidance || `Remediate the verified ${failureClass} weakness for ${problemClass}, then prove transfer on an independent unseen case.`
  const result: PlanCandidate[] = []

  for (const subjectId of subjects.slice(0, 3)) {
    result.push({
      planKey: planKey(['failure_autopsy', row.id, subjectId]),
      subjectId,
      language: null,
      languageDimension: null,
      failureClass,
      sourceKind: 'failure_autopsy',
      sourceRef: row.id,
      problemClass,
      objective,
      strategy,
      priority: row.status === 'retest_failed' ? 100 : 96,
      repeatedCount: repeatedFailures,
      evidence: { turnId: row.turn_id, autopsyStatus: row.status, updatedAt: row.updated_at },
    })
  }

  for (const language of languages) {
    const languageStrategy = selectCosUniversityStudyStrategy({ failureClass: 'language', repeatedFailures, independentRetestFailures })
    result.push({
      planKey: planKey(['failure_autopsy_language', row.id, language]),
      subjectId: 'language_communication',
      language,
      languageDimension: null,
      failureClass: 'language',
      sourceKind: 'failure_autopsy',
      sourceRef: row.id,
      problemClass,
      objective: `Remediate the verified ${language} language/communication weakness across the required dimensions, then take independent unseen language evaluation.`,
      strategy: languageStrategy,
      priority: 100,
      repeatedCount: repeatedFailures,
      evidence: { turnId: row.turn_id, autopsyStatus: row.status, updatedAt: row.updated_at },
    })
  }

  return result
}

function rotationCandidates(state: CosUniversityAcademicState, now: Date): PlanCandidate[] {
  const cycle = dayNumber(now)
  const subject = rotatingUniversitySubjectTarget(state.subjectTranscript, cycle, 'A+')
  const language = rotatingPlatformLanguageTarget(state.languageTranscript, cycle, 'A+')
  const candidates: PlanCandidate[] = []

  if (subject) {
    const definition = cosUniversitySubjectById(subject.subjectId)
    const strategy = selectCosUniversityStudyStrategy({ failureClass: 'unknown' })
    candidates.push({
      planKey: planKey(['academic_rotation', subject.subjectId]),
      subjectId: subject.subjectId,
      language: null,
      languageDimension: null,
      failureClass: 'unknown',
      sourceKind: 'academic_rotation',
      sourceRef: now.toISOString().slice(0, 10),
      problemClass: null,
      objective: `Advance ${definition.title} from ${subject.grade} toward A+ through current authoritative study, deliberate practice, and later independent transfer examination. Focus on: ${definition.studyThemes.join('; ')}.`,
      strategy,
      priority: 62,
      repeatedCount: 1,
      evidence: { currentGrade: subject.grade, targetGrade: 'A+', rotationDay: cycle },
    })
  }

  if (language) {
    const strategy = selectCosUniversityStudyStrategy({ failureClass: 'language' })
    candidates.push({
      planKey: planKey(['language_rotation', language.language]),
      subjectId: 'language_communication',
      language: language.language,
      languageDimension: null,
      failureClass: 'language',
      sourceKind: 'language_rotation',
      sourceRef: now.toISOString().slice(0, 10),
      problemClass: null,
      objective: `Advance ${language.title} from ${language.grade} toward A+ across comprehension, writing, instruction following, translation/localization, and cultural pragmatics.`,
      strategy,
      priority: 64,
      repeatedCount: 1,
      evidence: { currentGrade: language.grade, targetGrade: 'A+', rotationDay: cycle },
    })
  }

  return candidates
}

async function persistStudyPlan(candidate: PlanCandidate, now: string): Promise<CosUniversityStudyPlanRow | null> {
  const db = cosServiceDb()
  if (!db) return null
  const insert = await db.from('cos_university_study_plans').upsert({
    plan_key: candidate.planKey,
    agent_id: AGENT_ID,
    subject_id: candidate.subjectId,
    language_code: candidate.language,
    language_dimension: candidate.languageDimension,
    failure_class: candidate.failureClass,
    target_grade: 'A+',
    source_kind: candidate.sourceKind,
    source_ref: candidate.sourceRef,
    problem_class: candidate.problemClass,
    objective: candidate.objective,
    methods: candidate.strategy.methods,
    acquisition_source_kinds: candidate.strategy.acquisitionSourceKinds,
    fine_tune_candidate: candidate.strategy.fineTuneCandidate,
    priority: candidate.priority,
    status: 'queued',
    evidence: { ...candidate.evidence, learningDesign: candidate.strategy.learningDesign },
    last_seen_at: now,
    updated_at: now,
  }, { onConflict: 'plan_key', ignoreDuplicates: true })
  if (insert.error) throw insert.error

  const result = await db.from('cos_university_study_plans')
    .select('id,plan_key,subject_id,language_code,language_dimension,failure_class,target_grade,source_kind,source_ref,problem_class,objective,methods,acquisition_source_kinds,fine_tune_candidate,priority,status,attempt_count,last_seen_at,last_attempt_at,created_at,updated_at')
    .eq('plan_key', candidate.planKey)
    .maybeSingle()
  if (result.error) throw result.error
  return (result.data || null) as CosUniversityStudyPlanRow | null
}

export async function markCosUniversityStudyPlansAttempted(planIds: string[], now = new Date()): Promise<number> {
  const ids = [...new Set(planIds.map(value => clean(value, 80)).filter(Boolean))]
  if (!ids.length) return 0
  const db = cosServiceDb()
  if (!db) return 0
  const current = await db.from('cos_university_study_plans')
    .select('id,attempt_count,status')
    .in('id', ids)
  if (current.error) throw current.error
  let updated = 0
  for (const row of current.data || []) {
    if (row.status === 'completed' || row.status === 'superseded') continue
    const result = await db.from('cos_university_study_plans').update({
      status: 'studying',
      attempt_count: Number(row.attempt_count || 0) + 1,
      last_attempt_at: now.toISOString(),
      updated_at: now.toISOString(),
    }).eq('id', row.id)
    if (result.error) throw result.error
    updated += 1
  }
  return updated
}

/**
 * Create this cycle's durable study work. Verified failures come first; a daily subject + language
 * rotation fills unused capacity so a machine keeps learning even when nothing is broken.
 *
 * This planner is model-free and does not award grades. It only records what to study and emits
 * bounded acquisition signals for methods that the existing governed learning pipeline can execute.
 */
export async function runCosUniversityPlanningCycle(options: {
  now?: Date
  maxPlans?: number
  failureRows?: FailureAutopsyPlanningRow[]
  academicState?: CosUniversityAcademicState
} = {}): Promise<CosUniversityPlanningCycleSummary> {
  const now = options.now instanceof Date ? options.now : new Date()
  const maxPlans = Math.max(1, Math.min(12, Math.floor(options.maxPlans || 4)))
  const errors: string[] = []
  let academicState: CosUniversityAcademicState | null = options.academicState || null
  let failures: FailureAutopsyPlanningRow[] = options.failureRows || []

  try {
    if (!academicState) academicState = await readCosUniversityAcademicState(now)
  } catch (error) {
    errors.push(`academic_state:${error instanceof Error ? error.message : String(error)}`)
  }
  if (!academicState) {
    academicState = academicStateFromRows([], now)
    errors.push('academic_state:using_empty_transcript')
  }

  try {
    if (!options.failureRows) failures = await loadUnresolvedFailureAutopsies()
  } catch (error) {
    errors.push(`failure_autopsies:${error instanceof Error ? error.message : String(error)}`)
  }

  const candidates = [
    ...failures.flatMap(autopsyCandidates),
    ...rotationCandidates(academicState, now),
  ]
    .sort((a, b) => b.priority - a.priority || a.planKey.localeCompare(b.planKey))
    .slice(0, maxPlans)

  const activePlans: CosUniversityPlanningCycleSummary['activePlans'] = []
  const gapSignals: KnowledgeGapSignal[] = []

  for (const candidate of candidates) {
    try {
      const row = await persistStudyPlan(candidate, now.toISOString())
      if (!row || row.status === 'completed' || row.status === 'superseded') continue
      activePlans.push({
        id: row.id,
        planKey: candidate.planKey,
        subjectId: candidate.subjectId,
        language: candidate.language,
        failureClass: candidate.failureClass,
        sourceKind: candidate.sourceKind,
        objective: candidate.objective,
        priority: candidate.priority,
        methods: candidate.strategy.methods,
        acquisitionSourceKinds: candidate.strategy.acquisitionSourceKinds,
        learningDesign: candidate.strategy.learningDesign,
        fineTuneCandidate: candidate.strategy.fineTuneCandidate,
      })

      // Only emit an acquisition gap when the selected strategy actually contains an automatic
      // acquisition method. Labs/A2A/fine-tuning remain explicit planned work until their bridge exists.
      if (!candidate.strategy.acquisitionSourceKinds.length) continue
      gapSignals.push(candidate.language
        ? platformLanguageStudyGapSignal({
            planKey: candidate.planKey,
            language: candidate.language,
            objective: candidate.objective,
            strategy: candidate.strategy,
            repeatedCount: candidate.repeatedCount,
          })
        : universityStudyGapSignal({
            planKey: candidate.planKey,
            subjectId: candidate.subjectId,
            objective: candidate.objective,
            failureClass: candidate.failureClass,
            strategy: candidate.strategy,
            repeatedCount: candidate.repeatedCount,
            evidence: [`source_kind=${candidate.sourceKind}`, `source_ref=${candidate.sourceRef || 'none'}`],
          }))
    } catch (error) {
      errors.push(`plan:${candidate.planKey.slice(0, 12)}:${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return {
    ok: errors.length === 0,
    academicState,
    consideredFailures: failures.length,
    activePlans,
    gapSignals,
    errors,
  }
}
