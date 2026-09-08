import { createHash } from 'node:crypto'
import { ContinuousLearningCycle } from '@/lib/cos-core/layers/learning/cycle'
import { ContinuousLearningDirector } from '@/lib/cos-core/layers/learning'
import { createLiveLearningAdapters } from '@/lib/cos-core/layers/learning/liveSources'
import { generateKnowledgeGaps, knowledgeGapIdForSignal } from '@/lib/cos-core/layers/learning/gaps'
import { createSupabaseCOSStores, cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  approvedUrlLearningAdapter,
  autonomousLearningReadiness,
  parseApprovedLearningUrls,
} from '@/lib/cos/dailyAutonomousLearning'
import { markCosUniversityStudyPlansAttempted } from './cosUniversityStore.ts'
import {
  COS_UNIVERSITY_STUDY_COOLDOWN_MINUTES,
  cosUniversityPlanEligibleForContinuousStudy,
} from './cosUniversityContinuousCadence.ts'
import {
  cosUniversityMastersCourseworkModulePasses,
  cosUniversityMastersTrackById,
  cosUniversityMastersTrackIdFromProgramKey,
  type CosUniversityMastersProgramId,
} from './cosUniversityMasters.ts'
import {
  readCosUniversityMastersEvidence,
  readCosUniversityMastersRuntimeStatus,
} from './cosUniversityMastersRuntime.ts'
import {
  selectCosUniversityStudyStrategy,
  universityStudyGapSignal,
  type CosUniversityFailureClass,
} from './cosUniversityStudyStrategy.ts'

const AGENT_ID = 'cos'
const ZERO_EXTERNAL_COST_POLICY = {
  allowedSourceKinds: new Set([
    'work_experience',
    'engineering_history',
    'official_documentation',
    'research_paper',
    'scientific_journal',
    'library_material',
    'news_article',
    'public_dataset',
    'video_transcript',
    'approved_public_web',
  ] as const),
  minimumConfidence: 0.72,
  maxCandidatesPerCycle: 40,
  maxExternalCostUsdPerCycle: 0,
}

type EnrollmentRow = { program_key: string }
type RunRow = { id: string }
type PlanRow = {
  id: string
  plan_key: string
  subject_id: string
  objective: string
  priority: number
  status: string
  last_attempt_at: string | null
  module_key: string
}

export type CosUniversityMastersLearningSummary = {
  enabled: boolean
  claimed: boolean
  slotKey: string
  programId: CosUniversityMastersProgramId | null
  status: 'disabled' | 'not_enrolled' | 'program_inactive' | 'already_claimed' | 'idle' | 'learned' | 'error'
  modulesIncomplete: number
  plansConsidered: number
  plansEligible: number
  documentsAcquired: number
  accepted: number
  probationary: number
  plansAttempted: number
  errors: string[]
  semantics: 'masters_uses_shared_learning_engine_study_never_awards_credit'
}

function clean(value: unknown, max = 1600): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  try { return JSON.stringify(error).slice(0, 1600) } catch { return String(error) }
}

function slotKey(now: Date): string {
  const minute = now.getUTCMinutes() < 30 ? '00' : '30'
  return `${now.toISOString().slice(0, 13)}:${minute}Z`
}

function emptySummary(now: Date, status: CosUniversityMastersLearningSummary['status']): CosUniversityMastersLearningSummary {
  return {
    enabled: process.env.COS_UNIVERSITY_MASTERS_LEARNING_ENABLED === 'true',
    claimed: false,
    slotKey: slotKey(now),
    programId: null,
    status,
    modulesIncomplete: 0,
    plansConsidered: 0,
    plansEligible: 0,
    documentsAcquired: 0,
    accepted: 0,
    probationary: 0,
    plansAttempted: 0,
    errors: [],
    semantics: 'masters_uses_shared_learning_engine_study_never_awards_credit',
  }
}

async function activeProgramId(): Promise<CosUniversityMastersProgramId | null> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_program_enrollments')
    .select('program_key')
    .eq('agent_id', AGENT_ID)
    .eq('program_level', 'masters')
    .order('enrolled_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (result.error) throw result.error
  const row = (result.data || null) as EnrollmentRow | null
  return row ? cosUniversityMastersTrackIdFromProgramKey(row.program_key) : null
}

async function claimSlot(programId: CosUniversityMastersProgramId, key: string, now: Date): Promise<RunRow | null> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const programKey = `specialist_masters_${programId}_v1`
  const result = await db.from('cos_university_masters_learning_runs').insert({
    slot_key: `${programId}:${key}`,
    agent_id: AGENT_ID,
    program_key: programKey,
    program_id: programId,
    status: 'running',
    started_at: now.toISOString(),
    updated_at: now.toISOString(),
  }).select('id').maybeSingle()
  if (!result.error && result.data) return result.data as RunRow
  if (String((result.error as { code?: string } | null)?.code || '') === '23505') return null
  if (result.error) throw result.error
  return null
}

async function finishSlot(runId: string, summary: CosUniversityMastersLearningSummary, now: Date): Promise<void> {
  const db = cosServiceDb()
  if (!db) return
  const result = await db.from('cos_university_masters_learning_runs').update({
    status: summary.status === 'error' ? 'error' : 'completed',
    plans_considered: summary.plansConsidered,
    plans_attempted: summary.plansAttempted,
    documents_acquired: summary.documentsAcquired,
    accepted_count: summary.accepted,
    errors: summary.errors,
    completed_at: now.toISOString(),
    updated_at: now.toISOString(),
  }).eq('id', runId)
  if (result.error) throw result.error
}

function failureClassForSubject(subjectId: string): CosUniversityFailureClass {
  if (subjectId === 'computer_science' || subjectId === 'cybersecurity') return 'tool_execution'
  if (subjectId === 'statistics_data_science') return 'evidence_selection'
  if (subjectId === 'reasoning_decision_science' || subjectId === 'mathematics') return 'reasoning'
  return 'unknown'
}

function planKey(programId: CosUniversityMastersProgramId, moduleKey: string): string {
  return createHash('sha256').update(`masters|${programId}|${moduleKey}`).digest('hex')
}

async function ensureModulePlans(programId: CosUniversityMastersProgramId, now: Date): Promise<PlanRow[]> {
  const track = cosUniversityMastersTrackById(programId)
  if (!track) return []
  const evidence = await readCosUniversityMastersEvidence(programId)
  const completed = cosUniversityMastersCourseworkModulePasses(evidence, programId, now)
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const rows: PlanRow[] = []

  for (const module of track.curriculumModules) {
    if (completed.get(module.key) === true) continue
    const failureClass = failureClassForSubject(module.subjectId)
    const strategy = selectCosUniversityStudyStrategy({ failureClass })
    const key = planKey(programId, module.key)
    const objective = `${module.title}: ${module.objective} Study current authoritative material, practice transfer, and prepare for a fresh host-controlled Master’s coursework examination.`
    const insert = await db.from('cos_university_study_plans').upsert({
      plan_key: key,
      agent_id: AGENT_ID,
      subject_id: module.subjectId,
      language_code: null,
      language_dimension: null,
      failure_class: failureClass,
      target_grade: 'A+',
      source_kind: 'academic_rotation',
      source_ref: `masters:${programId}:${module.key}`,
      problem_class: `masters_${programId}_${module.key}`,
      objective,
      methods: strategy.methods,
      acquisition_source_kinds: strategy.acquisitionSourceKinds,
      fine_tune_candidate: strategy.fineTuneCandidate,
      priority: 82,
      status: 'queued',
      evidence: {
        academicLevel: 'masters',
        programId,
        moduleKey: module.key,
        academicCredit: false,
        target: 'A+',
      },
      academic_level: 'masters',
      program_key: `specialist_masters_${programId}_v1`,
      module_key: module.key,
      last_seen_at: now.toISOString(),
      updated_at: now.toISOString(),
    }, { onConflict: 'plan_key', ignoreDuplicates: true })
    if (insert.error) throw insert.error

    const result = await db.from('cos_university_study_plans')
      .select('id,plan_key,subject_id,objective,priority,status,last_attempt_at,module_key')
      .eq('agent_id', AGENT_ID)
      .eq('plan_key', key)
      .maybeSingle()
    if (result.error) throw result.error
    if (result.data && result.data.status !== 'completed' && result.data.status !== 'superseded') rows.push(result.data as PlanRow)
  }
  return rows
}

function eligiblePlans(plans: PlanRow[], now: Date, maxPlans: number): PlanRow[] {
  return plans
    .filter(row => cosUniversityPlanEligibleForContinuousStudy({
      id: row.id,
      status: row.status,
      lastAttemptAt: row.last_attempt_at,
    }, now, COS_UNIVERSITY_STUDY_COOLDOWN_MINUTES))
    .sort((a, b) => b.priority - a.priority || a.module_key.localeCompare(b.module_key))
    .slice(0, maxPlans)
}

export async function runCosUniversityMastersLearning(options: {
  now?: Date
  maxStudyPlans?: number
} = {}): Promise<CosUniversityMastersLearningSummary> {
  const now = options.now instanceof Date ? options.now : new Date()
  const summary = emptySummary(now, 'idle')
  if (process.env.COS_UNIVERSITY_MASTERS_LEARNING_ENABLED !== 'true') {
    summary.status = 'disabled'
    return summary
  }
  if (!autonomousLearningReadiness().autonomousEnabled) {
    summary.status = 'error'
    summary.errors.push('autonomous_learning_disabled')
    return summary
  }

  let claim: RunRow | null = null
  try {
    const programId = await activeProgramId()
    if (!programId) {
      summary.status = 'not_enrolled'
      return summary
    }
    summary.programId = programId
    const runtime = await readCosUniversityMastersRuntimeStatus(programId, now)
    if (!runtime.enrollment || runtime.credential || runtime.timingStatus === 'deadline_expired' || runtime.timingStatus === 'not_enrolled') {
      summary.status = 'program_inactive'
      return summary
    }

    claim = await claimSlot(programId, summary.slotKey, now)
    if (!claim) {
      summary.status = 'already_claimed'
      return summary
    }
    summary.claimed = true

    const plans = await ensureModulePlans(programId, now)
    summary.modulesIncomplete = plans.length
    summary.plansConsidered = plans.length
    const maxStudyPlans = Math.max(1, Math.min(4, Math.floor(options.maxStudyPlans || 2)))
    const selected = eligiblePlans(plans, now, maxStudyPlans)
    summary.plansEligible = selected.length
    if (!selected.length) {
      await finishSlot(claim.id, summary, new Date())
      return summary
    }

    const store = createSupabaseCOSStores()?.continuousLearning
    if (!store) throw new Error('persistent_learning_store_unavailable')
    const approvedUrls = parseApprovedLearningUrls()
    const adapters = [
      ...(approvedUrls.length ? [approvedUrlLearningAdapter(approvedUrls)] : []),
      ...createLiveLearningAdapters(),
    ]
    const director = new ContinuousLearningDirector(store, ZERO_EXTERNAL_COST_POLICY)

    const plannedSignals = selected.map(plan => {
      const failureClass = failureClassForSubject(plan.subject_id)
      const strategy = selectCosUniversityStudyStrategy({ failureClass })
      return {
        planId: plan.id,
        signal: universityStudyGapSignal({
          planKey: plan.plan_key,
          subjectId: plan.subject_id as Parameters<typeof universityStudyGapSignal>[0]['subjectId'],
          objective: clean(plan.objective),
          failureClass,
          strategy,
          repeatedCount: 1,
          evidence: [`academic_level=masters`, `program_id=${programId}`, `module_key=${plan.module_key}`],
        }),
      }
    })
    const gaps = generateKnowledgeGaps(plannedSignals.map(row => row.signal))
    if (!gaps.length) {
      await finishSlot(claim.id, summary, new Date())
      return summary
    }
    const planIdByGapId = new Map(plannedSignals.map(row => [knowledgeGapIdForSignal(row.signal), row.planId]))
    const result = await new ContinuousLearningCycle(director, adapters).run(gaps, 0)
    summary.status = result.accepted > 0 ? 'learned' : 'idle'
    summary.documentsAcquired = result.documentsAcquired
    summary.accepted = result.accepted
    summary.probationary = result.probationary
    const successfulPlanIds = [...new Set(result.acceptedGapIds.map(gapId => planIdByGapId.get(gapId)).filter((id): id is string => Boolean(id)))]
    if (successfulPlanIds.length) {
      summary.plansAttempted = await markCosUniversityStudyPlansAttempted(successfulPlanIds, new Date())
    }
    await finishSlot(claim.id, summary, new Date())
    return summary
  } catch (error) {
    summary.status = 'error'
    summary.errors.push(describeError(error))
    if (claim) {
      try { await finishSlot(claim.id, summary, new Date()) } catch (finishError) { summary.errors.push(`finish:${describeError(finishError)}`) }
    }
    return summary
  }
}
