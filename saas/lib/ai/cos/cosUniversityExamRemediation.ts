import { createHash } from 'node:crypto'
import type { KnowledgeGapSignal } from '@/lib/cos-core/layers/learning/gaps'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { cosUniversitySubjectById, type CosUniversitySubjectId } from './cosUniversity.ts'
import type { CosPlatformLanguage, CosPlatformLanguageDimension } from './cosUniversityLanguages.ts'
import { universityExamValidityDays, type CosUniversityExamTarget } from './cosUniversityIndependentExam.ts'
import {
  platformLanguageStudyGapSignal,
  selectCosUniversityStudyStrategy,
  universityStudyGapSignal,
  type CosUniversityStudyStrategy,
} from './cosUniversityStudyStrategy.ts'

const DEFAULT_AGENT_ID = 'cos'
const SOURCE_KIND = 'recertification'
const REMEDIATION_STUDY_VARIANT_MS = 15 * 60_000
const PLAN_SELECT_FIELDS = 'id,plan_key,subject_id,language_code,language_dimension,failure_class,source_kind,source_ref,objective,priority,methods,acquisition_source_kinds,fine_tune_candidate,status,evidence' as const

type FailedExamRow = {
  id: string
  run_key: string
  target_kind: 'subject' | 'language'
  subject_id: CosUniversitySubjectId | null
  language_code: CosPlatformLanguage | null
  language_dimension: CosPlatformLanguageDimension | null
  status: 'passed' | 'failed'
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
  source_ref: string
  objective: string
  priority: number
  methods: CosUniversityStudyStrategy['methods']
  acquisition_source_kinds: CosUniversityStudyStrategy['acquisitionSourceKinds']
  fine_tune_candidate: boolean
  status: string
  evidence: Record<string, unknown> | null
}

export type CosUniversityExamRemediationPlan = {
  id: string
  planKey: string
  subjectId: CosUniversitySubjectId
  language: CosPlatformLanguage | null
  languageDimension: CosPlatformLanguageDimension | null
  failureClass: 'unknown' | 'language'
  sourceKind: 'recertification'
  objective: string
  priority: number
  methods: CosUniversityStudyStrategy['methods']
  acquisitionSourceKinds: CosUniversityStudyStrategy['acquisitionSourceKinds']
  learningDesign: CosUniversityStudyStrategy['learningDesign']
  fineTuneCandidate: boolean
}

export type CosUniversityExamRemediationSummary = {
  failuresConsidered: number
  supersededPlans: number
  activePlans: CosUniversityExamRemediationPlan[]
  gapSignals: KnowledgeGapSignal[]
}

/** Rotate the public curriculum theme used for discovery on each learning slot. */
export function cosUniversityRemediationStudyVariant(now: Date): number {
  return Math.floor(now.getTime() / REMEDIATION_STUDY_VARIANT_MS)
}

function key(parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex')
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function hasCompletedRemediationProof(row: PlanRow, failure: FailedExamRow): boolean {
  if (row.status !== 'superseded' || row.source_ref !== failure.id) return false
  const evidence = record(row.evidence)
  const studyProof = record(evidence.studyProof)
  const practice = record(evidence.deliberatePractice)
  return Array.isArray(studyProof.evidenceRefs)
    && studyProof.evidenceRefs.length > 0
    && practice.readyForIndependentExam === true
}

function withGovernedPublicWebForSubjectExamRemediation(
  strategy: CosUniversityStudyStrategy,
): CosUniversityStudyStrategy {
  const methods: CosUniversityStudyStrategy['methods'] = strategy.methods.some(item => item.id === 'live_authoritative_research')
    ? strategy.methods
    : [
        ...strategy.methods,
        {
          id: 'live_authoritative_research',
          execution: 'automatic_acquisition',
          reason: 'Independent subject-exam remediation may use governed authoritative public-web evidence while preserving source admission and examiner isolation.',
        },
      ]
  const acquisitionSourceKinds: CosUniversityStudyStrategy['acquisitionSourceKinds'] = strategy.acquisitionSourceKinds.includes('approved_public_web')
    ? strategy.acquisitionSourceKinds
    : [...strategy.acquisitionSourceKinds, 'approved_public_web']

  return { ...strategy, methods, acquisitionSourceKinds }
}

function examTarget(row: FailedExamRow): CosUniversityExamTarget | null {
  if (row.target_kind === 'subject' && row.subject_id) {
    return { kind: 'subject', subjectId: row.subject_id }
  }
  if (row.target_kind === 'language' && row.language_code && row.language_dimension) {
    return { kind: 'language', language: row.language_code, dimension: row.language_dimension }
  }
  return null
}

function examTargetKey(target: CosUniversityExamTarget): string {
  return target.kind === 'subject'
    ? `subject:${target.subjectId}`
    : `language:${target.language}:${target.dimension}`
}

function failureIsFresh(row: FailedExamRow, target: CosUniversityExamTarget, now: Date): boolean {
  const completedAt = Date.parse(String(row.completed_at || ''))
  if (!Number.isFinite(completedAt)) return false
  return completedAt + universityExamValidityDays(target) * 86_400_000 > now.getTime()
}

/**
 * Reconcile terminal exam history by target. Only the latest terminal outcome for a competency may
 * drive remediation. A newer pass supersedes every older failure; an expired latest failure is also
 * retired instead of permanently occupying the bounded University study window.
 */
async function loadCurrentFailedExams(agentId: string, limit: number, now: Date): Promise<{
  failures: FailedExamRow[]
  supersededFailureIds: string[]
}> {
  const db = cosServiceDb()
  if (!db) return { failures: [], supersededFailureIds: [] }
  const result = await db.from('cos_university_exam_runs')
    .select('id,run_key,target_kind,subject_id,language_code,language_dimension,status,completed_at')
    .like('run_key', `%:${agentId}:%`)
    .in('status', ['passed', 'failed'])
    .order('completed_at', { ascending: false })
    .limit(Math.max(50, Math.min(500, limit * 30)))
  if (result.error) throw result.error

  const rows = (result.data || []) as FailedExamRow[]
  const latestByTarget = new Map<string, { row: FailedExamRow; target: CosUniversityExamTarget }>()
  const supersededFailureIds: string[] = []

  for (const row of rows) {
    const target = examTarget(row)
    if (!target) continue
    const targetKey = examTargetKey(target)
    if (!latestByTarget.has(targetKey)) {
      latestByTarget.set(targetKey, { row, target })
      continue
    }
    if (row.status === 'failed') supersededFailureIds.push(row.id)
  }

  const failures: FailedExamRow[] = []
  for (const { row, target } of latestByTarget.values()) {
    if (row.status !== 'failed') continue
    if (!failureIsFresh(row, target, now)) {
      supersededFailureIds.push(row.id)
      continue
    }
    failures.push(row)
    if (failures.length >= limit) break
  }

  return { failures, supersededFailureIds: [...new Set(supersededFailureIds)] }
}

async function supersedeResolvedFailurePlans(agentId: string, failureIds: string[]): Promise<number> {
  if (!failureIds.length) return 0
  const db = cosServiceDb()
  if (!db) return 0
  const now = new Date().toISOString()
  const result = await db.from('cos_university_study_plans')
    .update({ status: 'superseded', updated_at: now, last_seen_at: now })
    .eq('agent_id', agentId)
    .eq('source_kind', SOURCE_KIND)
    .in('source_ref', failureIds)
    .in('status', ['queued', 'studying', 'ready_for_exam'])
    .select('id')
  if (result.error) throw result.error
  return (result.data || []).length
}

async function persistPlan(agentId: string, failure: FailedExamRow): Promise<{ row: PlanRow; strategy: CosUniversityStudyStrategy } | null> {
  const db = cosServiceDb()
  if (!db) return null
  const isLanguage = failure.target_kind === 'language' && failure.language_code && failure.language_dimension
  const subjectId: CosUniversitySubjectId = isLanguage ? 'language_communication' : failure.subject_id || 'reasoning_decision_science'
  const baseStrategy = selectCosUniversityStudyStrategy({ failureClass: isLanguage ? 'language' : 'unknown', repeatedFailures: 1, independentRetestFailures: 1 })
  const strategy = isLanguage ? baseStrategy : withGovernedPublicWebForSubjectExamRemediation(baseStrategy)
  const planKey = key(['independent_exam_failure', failure.id, subjectId, failure.language_code || '', failure.language_dimension || ''])
  const objective = isLanguage
    ? `Remediate the weakness demonstrated by a fresh independent unseen ${failure.language_code} ${String(failure.language_dimension).replaceAll('_', ' ')} examination. Study and practice the competency broadly without access to the hidden exam rubric, then prove improvement on a new independent case.`
    : `Remediate the weakness demonstrated by a fresh independent unseen ${cosUniversitySubjectById(subjectId).title} examination. Study the subject broadly, use deliberate practice, preserve examiner isolation, and prove improvement on a new independent case.`
  // The durable study-plan schema caps priority at 100. Runtime ordering separately keeps
  // independent-exam remediation ahead of generic plans that may also carry priority 100.
  const priority = 100
  const now = new Date().toISOString()
  const insert = await db.from('cos_university_study_plans').upsert({
    plan_key: planKey,
    agent_id: agentId,
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
      learningDesign: strategy.learningDesign,
    },
    last_seen_at: now,
    updated_at: now,
  }, { onConflict: 'plan_key', ignoreDuplicates: true })
  if (insert.error) throw insert.error

  const result = await db.from('cos_university_study_plans')
    .select(PLAN_SELECT_FIELDS)
    .eq('plan_key', planKey)
    .maybeSingle()
  if (result.error) throw result.error
  if (!result.data || result.data.status === 'completed') return null

  let row = result.data as PlanRow
  // Before remediation-specific run identities existed, a same-day retest reused the original
  // failed run and incorrectly superseded a fully studied/practised plan. Recover only that proven
  // current-failure state; ordinary superseded plans remain terminal.
  if (hasCompletedRemediationProof(row, failure)) {
    const evidence = {
      ...record(row.evidence),
      remediationRetestRecovery: {
        recoveredAt: now,
        reason: 'same_day_exam_identity_collision',
        academicCredit: false,
      },
    }
    const recovered = await db.from('cos_university_study_plans')
      .update({ status: 'ready_for_exam', evidence, updated_at: now, last_seen_at: now })
      .eq('id', row.id)
      .eq('status', 'superseded')
      .select(PLAN_SELECT_FIELDS)
      .maybeSingle()
    if (recovered.error) throw recovered.error
    if (recovered.data) row = recovered.data as PlanRow
  }
  if (row.status === 'superseded') return null
  // Existing remediation plans predate the governed web lane. Refresh only the source policy on an
  // active subject-remediation plan; never reset its status, attempts, proof fence, or exam lineage.
  if (!isLanguage && !row.acquisition_source_kinds.includes('approved_public_web')) {
    const refreshed = await db.from('cos_university_study_plans')
      .update({
        methods: strategy.methods,
        acquisition_source_kinds: strategy.acquisitionSourceKinds,
        updated_at: now,
      })
      .eq('id', row.id)
      .in('status', ['queued', 'studying', 'ready_for_exam'])
      .select(PLAN_SELECT_FIELDS)
      .maybeSingle()
    if (refreshed.error) throw refreshed.error
    if (refreshed.data) row = refreshed.data as PlanRow
  }

  return { row, strategy }
}

export async function ensureCosUniversityExamFailureRemediationPlans(options: {
  agentId?: string
  maxPlans?: number
  now?: Date
} = {}): Promise<CosUniversityExamRemediationSummary> {
  const maxPlans = Math.max(1, Math.min(8, Math.floor(options.maxPlans || 4)))
  const agentId = String(options.agentId || DEFAULT_AGENT_ID).trim()
  if (!agentId) return { failuresConsidered: 0, supersededPlans: 0, activePlans: [], gapSignals: [] }
  const now = options.now instanceof Date ? options.now : new Date()
  const studyVariant = cosUniversityRemediationStudyVariant(now)
  const reconciliation = await loadCurrentFailedExams(agentId, maxPlans * 3, now)
  const supersededPlans = await supersedeResolvedFailurePlans(agentId, reconciliation.supersededFailureIds)
  const failures = reconciliation.failures
  const activePlans: CosUniversityExamRemediationPlan[] = []
  const gapSignals: KnowledgeGapSignal[] = []

  for (const failure of failures) {
    if (activePlans.length >= maxPlans) break
    const persisted = await persistPlan(agentId, failure)
    if (!persisted) continue
    const { row, strategy } = persisted
    activePlans.push({
      id: row.id,
      planKey: row.plan_key,
      subjectId: row.subject_id,
      language: row.language_code,
      languageDimension: row.language_dimension,
      failureClass: row.failure_class,
      sourceKind: 'recertification',
      objective: row.objective,
      priority: row.priority,
      methods: strategy.methods,
      acquisitionSourceKinds: strategy.acquisitionSourceKinds,
      learningDesign: strategy.learningDesign,
      fineTuneCandidate: strategy.fineTuneCandidate,
    })
    if (row.language_code && row.language_dimension) {
      gapSignals.push(platformLanguageStudyGapSignal({
        planKey: row.plan_key,
        language: row.language_code,
        dimension: row.language_dimension,
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
        studyVariant,
        evidence: ['independent_unseen_exam_failed', 'hidden_exam_rubric_not_exposed'],
      }))
    }
  }

  return { failuresConsidered: failures.length, supersededPlans, activePlans, gapSignals }
}
