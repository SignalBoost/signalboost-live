import { createHash } from 'node:crypto'
import type { KnowledgeGapSignal } from '@/lib/cos-core/layers/learning/gaps'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { cosUniversitySubjectById, type CosUniversitySubjectId } from './cosUniversity.ts'
import type { CosPlatformLanguage, CosPlatformLanguageDimension } from './cosUniversityLanguages.ts'
import {
  platformLanguageStudyGapSignal,
  selectCosUniversityStudyStrategy,
  universityStudyGapSignal,
  type CosUniversityStudyStrategy,
} from './cosUniversityStudyStrategy.ts'

const AGENT_ID = 'cos'
const SOURCE_KIND = 'recertification'

type FailedExamRow = {
  id: string
  target_kind: 'subject' | 'language'
  subject_id: CosUniversitySubjectId | null
  language_code: CosPlatformLanguage | null
  language_dimension: CosPlatformLanguageDimension | null
  completed_at: string | null
}

type PlanRow = {
  id: string
  plan_key: string
  subject_id: CosUniversitySubjectId
  language_code: CosPlatformLanguage | null
  language_dimension: CosPlatformLanguageDimension | null
  failure_class: 'unknown' | 'language'
  source_kind: 'recertification'
  objective: string
  priority: number
  methods: CosUniversityStudyStrategy['methods']
  acquisition_source_kinds: CosUniversityStudyStrategy['acquisitionSourceKinds']
  fine_tune_candidate: boolean
  status: string
}

export type CosUniversityExamRemediationPlan = {
  id: string
  planKey: string
  subjectId: CosUniversitySubjectId
  language: CosPlatformLanguage | null
  failureClass: 'unknown' | 'language'
  sourceKind: 'recertification'
  objective: string
  priority: number
  methods: CosUniversityStudyStrategy['methods']
  acquisitionSourceKinds: CosUniversityStudyStrategy['acquisitionSourceKinds']
  fineTuneCandidate: boolean
}

export type CosUniversityExamRemediationSummary = {
  failuresConsidered: number
  activePlans: CosUniversityExamRemediationPlan[]
  gapSignals: KnowledgeGapSignal[]
}

function key(parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex')
}

async function loadRecentFailedExams(limit: number): Promise<FailedExamRow[]> {
  const db = cosServiceDb()
  if (!db) return []
  const result = await db.from('cos_university_exam_runs')
    .select('id,target_kind,subject_id,language_code,language_dimension,completed_at')
    .eq('status', 'failed')
    .order('completed_at', { ascending: false })
    .limit(Math.max(1, Math.min(50, limit)))
  if (result.error) throw result.error
  return (result.data || []) as FailedExamRow[]
}

async function persistPlan(failure: FailedExamRow): Promise<{ row: PlanRow; strategy: CosUniversityStudyStrategy } | null> {
  const db = cosServiceDb()
  if (!db) return null
  const isLanguage = failure.target_kind === 'language' && failure.language_code && failure.language_dimension
  const subjectId: CosUniversitySubjectId = isLanguage ? 'language_communication' : failure.subject_id || 'reasoning_decision_science'
  const strategy = selectCosUniversityStudyStrategy({ failureClass: isLanguage ? 'language' : 'unknown', repeatedFailures: 1, independentRetestFailures: 1 })
  const planKey = key(['independent_exam_failure', failure.id, subjectId, failure.language_code || '', failure.language_dimension || ''])
  const objective = isLanguage
    ? `Remediate the weakness demonstrated by a fresh independent unseen ${failure.language_code} ${String(failure.language_dimension).replaceAll('_', ' ')} examination. Study and practice the competency broadly without access to the hidden exam rubric, then prove improvement on a new independent case.`
    : `Remediate the weakness demonstrated by a fresh independent unseen ${cosUniversitySubjectById(subjectId).title} examination. Study the subject broadly, use deliberate practice, preserve examiner isolation, and prove improvement on a new independent case.`
  const priority = isLanguage ? 124 : 122
  const now = new Date().toISOString()
  const insert = await db.from('cos_university_study_plans').upsert({
    plan_key: planKey,
    agent_id: AGENT_ID,
    subject_id: subjectId,
    language_code: isLanguage ? failure.language_code : null,
    language_dimension: isLanguage ? failure.language_dimension : null,
    failure_class: isLanguage ? 'language' : 'unknown',
    target_grade: 'A+',
    source_kind: SOURCE_KIND,
    source_ref: failure.id,
    problem_class: isLanguage ? `language_${failure.language_code}_${failure.language_dimension}` : subjectId,
    objective,
    methods: strategy.methods,
    acquisition_source_kinds: strategy.acquisitionSourceKinds,
    fine_tune_candidate: strategy.fineTuneCandidate,
    priority,
    status: 'queued',
    evidence: {
      independentExamFailure: true,
      examRunId: failure.id,
      failedAt: failure.completed_at,
      hiddenExamDetailsExposed: false,
    },
    last_seen_at: now,
    updated_at: now,
  }, { onConflict: 'plan_key', ignoreDuplicates: true })
  if (insert.error) throw insert.error

  const result = await db.from('cos_university_study_plans')
    .select('id,plan_key,subject_id,language_code,language_dimension,failure_class,source_kind,objective,priority,methods,acquisition_source_kinds,fine_tune_candidate,status')
    .eq('plan_key', planKey)
    .maybeSingle()
  if (result.error) throw result.error
  if (!result.data || result.data.status === 'completed' || result.data.status === 'superseded') return null
  return { row: result.data as PlanRow, strategy }
}

export async function ensureCosUniversityExamFailureRemediationPlans(options: {
  maxPlans?: number
} = {}): Promise<CosUniversityExamRemediationSummary> {
  const maxPlans = Math.max(1, Math.min(8, Math.floor(options.maxPlans || 4)))
  const failures = await loadRecentFailedExams(maxPlans * 3)
  const activePlans: CosUniversityExamRemediationPlan[] = []
  const gapSignals: KnowledgeGapSignal[] = []

  for (const failure of failures) {
    if (activePlans.length >= maxPlans) break
    const persisted = await persistPlan(failure)
    if (!persisted) continue
    const { row, strategy } = persisted
    activePlans.push({
      id: row.id,
      planKey: row.plan_key,
      subjectId: row.subject_id,
      language: row.language_code,
      failureClass: row.failure_class,
      sourceKind: 'recertification',
      objective: row.objective,
      priority: row.priority,
      methods: strategy.methods,
      acquisitionSourceKinds: strategy.acquisitionSourceKinds,
      fineTuneCandidate: strategy.fineTuneCandidate,
    })
    if (row.language_code) {
      gapSignals.push(platformLanguageStudyGapSignal({
        planKey: row.plan_key,
        language: row.language_code,
        objective: row.objective,
        strategy,
        repeatedCount: 1,
      }))
    } else {
      gapSignals.push(universityStudyGapSignal({
        planKey: row.plan_key,
        subjectId: row.subject_id,
        objective: row.objective,
        failureClass: row.failure_class,
        strategy,
        repeatedCount: 1,
        evidence: ['independent_unseen_exam_failed', 'hidden_exam_rubric_not_exposed'],
      }))
    }
  }

  return { failuresConsidered: failures.length, activePlans, gapSignals }
}
