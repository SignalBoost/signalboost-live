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
import {
  recordAcceptedCosUniversityStudyAttempts,
  type CosUniversityAcceptedStudyProofInput,
} from './cosUniversityStudyProof.ts'
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

import { readCosUniversityAgentRole } from './cosUniversityAgentRegistry.ts'
import { requireMastersLearningAgentId, mastersLearningSlotKey, mastersLearningPlanKey, mastersLearningProgramBlocker } from './cosUniversityMastersAgentLearning.ts'
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
  agentId: string
  acquisitionInvoked: boolean
  reasons: string[]
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

function emptySummary(now: Date, status: CosUniversityMastersLearningSummary['status'], agentId: string): CosUniversityMastersLearningSummary {
  return {
    agentId, acquisitionInvoked: false, reasons: [],
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

async function activeProgramId(agentId: string): Promise<CosUniversityMastersProgramId | null> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_program_enrollments')
    .select('program_key')
    .eq('agent_id', agentId)
    .eq('program_level', 'masters')
    .order('enrolled_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (result.error) throw result.error
  const row = (result.data || null) as EnrollmentRow | null
  if (!row) return null
  const programId = cosUniversityMastersTrackIdFromProgramKey(row.program_key)
  if (!programId) throw new Error('invalid_masters_program_key')
  return programId
}

async function claimSlot(programId: CosUniversityMastersProgramId, key: string, now: Date, agentId: string): Promise<RunRow | null> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const programKey = `specialist_masters_${programId}_v1`
  const result = await db.from('cos_university_masters_learning_runs').insert({
    slot_key: mastersLearningSlotKey(agentId, programId, key),
    agent_id: agentId,
    program_key: programKey,
    program_id: programId,
    status: 'running',
    started_at: now.toISOString(),
    updated_at: now.toISOString(),
  }).select('id').maybeSingle()
  if (!result.error && result.data) return result.data as RunRow
  if (String((result.error as { code?: string } | null)?.code || '') === '23505') return null
  if (result.error) throw result.error
  throw new Error('masters_learning_claim_not_persisted')
}

async function finishSlot(runId: string, summary: CosUniversityMastersLearningSummary, now: Date): Promise<void> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_masters_learning_runs').update({
    status: summary.status === 'error' ? 'error' : 'completed',
    plans_considered: summary.plansConsidered,
    plans_attempted: summary.plansAttempted,
    documents_acquired: summary.documentsAcquired,
    accepted_count: summary.accepted,
    errors: summary.errors,
    completed_at: now.toISOString(),
    updated_at: now.toISOString(),
  }).eq('id', runId).eq('agent_id', summary.agentId).eq('program_id', summary.programId).select('id').maybeSingle()
  if (result.error) throw result.error
  if (!result.data) throw new Error('masters_learning_run_not_persisted')
}

function failureClassForSubject(subjectId: string): CosUniversityFailureClass {
  if (subjectId === 'computer_science' || subjectId === 'cybersecurity') return 'tool_execution'
  if (subjectId === 'statistics_data_science') return 'evidence_selection'
  if (subjectId === 'reasoning_decision_science' || subjectId === 'mathematics') return 'reasoning'
  return 'unknown'
}

async function ensureModulePlans(programId: CosUniversityMastersProgramId, now: Date, agentId: string): Promise<PlanRow[]> {
  const track = cosUniversityMastersTrackById(programId)
  if (!track) throw new Error('invalid_masters_program_key')
  const evidence = await readCosUniversityMastersEvidence(programId, agentId)
  const completed = cosUniversityMastersCourseworkModulePasses(evidence, programId, now)
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const rows: PlanRow[] = []

  for (const module of track.curriculumModules) {
    if (completed.get(module.key) === true) continue
    const failureClass = failureClassForSubject(module.subjectId)
    const strategy = selectCosUniversityStudyStrategy({ failureClass })
    const key = mastersLearningPlanKey(agentId, programId, module.key)
    const objective = `${module.title}: ${module.objective} Study current authoritative material, practice transfer, and prepare for a fresh host-controlled Master’s coursework examination.`
    const insert = await db.from('cos_university_study_plans').upsert({
      plan_key: key,
      agent_id: agentId,
      subject_id: module.subjectId,
      language_code: null,
      language_dimension: null,
      failure_class: failureClass,
      target_grade: 'A+',
      source_kind: 'academic_rotation',
      source_ref: agentId === 'cos' ? `masters:${programId}:${module.key}` : `masters:${agentId}:${programId}:${module.key}`,
      problem_class: `masters_${programId}_${module.key}`,
      objective,
      methods: strategy.methods,
      acquisition_source_kinds: strategy.acquisitionSourceKinds,
      fine_tune_candidate: strategy.fineTuneCandidate,
      priority: 82,
      status: 'queued',
      evidence: {
        agentId,
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
      .eq('agent_id', agentId)
      .eq('plan_key', key)
      .eq('academic_level', 'masters').eq('program_key', `specialist_masters_${programId}_v1`).eq('module_key', module.key)
      .maybeSingle()
    if (result.error) throw result.error
    if (!result.data) throw new Error('masters_learning_plan_scope_conflict')
    if (result.data.status !== 'completed' && result.data.status !== 'superseded') rows.push(result.data as PlanRow)
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
  agentId?: string
  maxStudyPlans?: number
} = {}): Promise<CosUniversityMastersLearningSummary> {
  const now = options.now instanceof Date ? options.now : new Date()
  const agentId = options.agentId === undefined ? 'cos' : options.agentId
  const summary = emptySummary(now, 'idle', agentId)
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
    requireMastersLearningAgentId(agentId)
    const role = await readCosUniversityAgentRole(agentId)
    if (!role) throw new Error('unregistered_university_agent')
    const programId = await activeProgramId(agentId)
    if (!programId) {
      summary.status = 'not_enrolled'
      return summary
    }
    summary.programId = programId
    const runtime = await readCosUniversityMastersRuntimeStatus(programId, now, undefined, agentId)
    const blocker = mastersLearningProgramBlocker(runtime, agentId)
    if (blocker) {
      summary.reasons.push(blocker)
      summary.status = 'program_inactive'
      return summary
    }

    claim = await claimSlot(programId, summary.slotKey, now, agentId)
    if (!claim) {
      summary.status = 'already_claimed'
      return summary
    }
    summary.claimed = true

    const plans = await ensureModulePlans(programId, now, agentId)
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
          evidence: [`agent_id=${agentId}`, `academic_level=masters`, `program_id=${programId}`, `module_key=${plan.module_key}`],
        }),
      }
    })
    const gaps = generateKnowledgeGaps(plannedSignals.map(row => row.signal))
    if (!gaps.length) {
      await finishSlot(claim.id, summary, new Date())
      return summary
    }
    const planIdByGapId = new Map(plannedSignals.map(row => [knowledgeGapIdForSignal(row.signal), row.planId]))
    summary.acquisitionInvoked = true
    const result = await new ContinuousLearningCycle(director, adapters).run(gaps, 0)
    summary.documentsAcquired = result.documentsAcquired
    summary.accepted = result.accepted
    summary.probationary = result.probationary

    const refsByPlan = new Map<string, string[]>()
    for (const gapId of result.acceptedGapIds) {
      const planId = planIdByGapId.get(gapId)
      if (!planId) continue
      const refs = refsByPlan.get(planId) || []
      refs.push(gapId)
      refsByPlan.set(planId, refs)
    }
    const acceptedAt = now.toISOString()
    const proofs: CosUniversityAcceptedStudyProofInput[] = [...refsByPlan.entries()].map(([planId, evidenceRefs]) => ({
      planId,
      evidenceRefs: [...new Set(evidenceRefs)],
      acceptedAt,
    }))
    if (proofs.length) {
      // Acquisition can outlive the initial check. Do not advance study under a changed identity/program.
      if (await readCosUniversityAgentRole(agentId) !== role || await activeProgramId(agentId) !== programId) {
        throw new Error('masters_learning_identity_or_program_changed')
      }
      const current = await readCosUniversityMastersRuntimeStatus(programId, new Date(), undefined, agentId)
      const currentBlocker = mastersLearningProgramBlocker(current, agentId)
      if (currentBlocker) throw new Error(currentBlocker)
      summary.plansAttempted = (await recordAcceptedCosUniversityStudyAttempts(proofs, new Date(), agentId)).length
    }
    summary.status = summary.plansAttempted > 0 ? 'learned' : 'idle'
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
