import { ContinuousLearningCycle } from '@/lib/cos-core/layers/learning/cycle'
import { ContinuousLearningDirector } from '@/lib/cos-core/layers/learning'
import { createLiveLearningAdapters } from '@/lib/cos-core/layers/learning/liveSources'
import { generateKnowledgeGaps, type KnowledgeGapSignal } from '@/lib/cos-core/layers/learning/gaps'
import { createSupabaseCOSStores, cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  approvedUrlLearningAdapter,
  autonomousLearningReadiness,
  parseApprovedLearningUrls,
} from '@/lib/cos/dailyAutonomousLearning'
import {
  markCosUniversityStudyPlansAttempted,
  runCosUniversityPlanningCycle,
} from './cosUniversityStore.ts'
import { ensureCosUniversityExamFailureRemediationPlans } from './cosUniversityExamRemediation.ts'
import {
  COS_UNIVERSITY_STUDY_COOLDOWN_MINUTES,
  cosUniversityContinuousSlotKey,
  cosUniversityPlanEligibleForContinuousStudy,
} from './cosUniversityContinuousCadence.ts'

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

export type CosUniversityContinuousLearningSummary = {
  enabled: boolean
  claimed: boolean
  slotKey: string
  status: 'disabled' | 'already_claimed' | 'idle' | 'learned' | 'error'
  planned: number
  examFailuresPrioritized: number
  eligible: number
  gapsConsidered: number
  documentsAcquired: number
  accepted: number
  probationary: number
  plansAttempted: number
  sourceErrors: Record<string, number>
  errors: string[]
  semantics: 'continuous_machine_learning_no_rest_exam_isolated'
}

type ContinuousRunRow = { id: string }
type StudyPlanStateRow = { id: string; status: string; last_attempt_at: string | null }

function emptySummary(args: {
  enabled: boolean
  claimed: boolean
  slotKey: string
  status: CosUniversityContinuousLearningSummary['status']
  errors?: string[]
}): CosUniversityContinuousLearningSummary {
  return {
    enabled: args.enabled,
    claimed: args.claimed,
    slotKey: args.slotKey,
    status: args.status,
    planned: 0,
    examFailuresPrioritized: 0,
    eligible: 0,
    gapsConsidered: 0,
    documentsAcquired: 0,
    accepted: 0,
    probationary: 0,
    plansAttempted: 0,
    sourceErrors: {},
    errors: args.errors || [],
    semantics: 'continuous_machine_learning_no_rest_exam_isolated',
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const row = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown }
    const parts = [
      row.code ? `code=${String(row.code)}` : '',
      row.message ? `message=${String(row.message)}` : '',
      row.details ? `details=${String(row.details)}` : '',
      row.hint ? `hint=${String(row.hint)}` : '',
    ].filter(Boolean)
    if (parts.length) return parts.join(' ').slice(0, 1600)
    try {
      return JSON.stringify(error).slice(0, 1600)
    } catch {
      return 'unknown_object_error'
    }
  }
  return String(error)
}

async function claimContinuousSlot(slotKey: string, now: Date): Promise<ContinuousRunRow | null> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_continuous_runs').insert({
    slot_key: slotKey,
    status: 'running',
    started_at: now.toISOString(),
    updated_at: now.toISOString(),
  }).select('id').maybeSingle()
  if (!result.error && result.data) return result.data as ContinuousRunRow
  if (String((result.error as { code?: string } | null)?.code || '') === '23505') return null
  if (result.error) throw result.error
  return null
}

async function finishContinuousSlot(
  runId: string,
  now: Date,
  summary: CosUniversityContinuousLearningSummary,
  planIds: string[],
): Promise<void> {
  const db = cosServiceDb()
  if (!db) return
  const result = await db.from('cos_university_continuous_runs').update({
    status: summary.status === 'error' ? 'error' : 'completed',
    planned_count: summary.planned,
    eligible_count: summary.eligible,
    gap_count: summary.gapsConsidered,
    documents_acquired: summary.documentsAcquired,
    accepted_count: summary.accepted,
    probationary_count: summary.probationary,
    plans_attempted: summary.plansAttempted,
    plan_ids: planIds,
    source_errors: summary.sourceErrors,
    errors: summary.errors,
    completed_at: now.toISOString(),
    updated_at: now.toISOString(),
  }).eq('id', runId)
  if (result.error) throw result.error
}

async function loadEligiblePlanIds(planIds: string[], now: Date): Promise<Set<string>> {
  if (!planIds.length) return new Set()
  const db = cosServiceDb()
  if (!db) return new Set()
  const result = await db.from('cos_university_study_plans')
    .select('id,status,last_attempt_at')
    .in('id', planIds)
  if (result.error) throw result.error
  const eligible = (result.data || [] as StudyPlanStateRow[])
    .filter(row => cosUniversityPlanEligibleForContinuousStudy({
      id: String(row.id),
      status: String(row.status || ''),
      lastAttemptAt: row.last_attempt_at ? String(row.last_attempt_at) : null,
    }, now, COS_UNIVERSITY_STUDY_COOLDOWN_MINUTES))
    .map(row => String(row.id))
  return new Set(eligible)
}

function signalMatchesPlan(signal: KnowledgeGapSignal, planKey: string): boolean {
  return String(signal.taskId || '').endsWith(planKey)
}

/**
 * Machine-native COS University learning lane.
 *
 * This is intentionally a frequent bounded sweep, not a human study session. It selects current
 * University work, respects a per-plan cooldown to avoid repeatedly rereading the same objective,
 * acquires only the source classes chosen by the Learning Strategist, and persists attempts. Fresh
 * independent exam failures get their own high-priority remediation bridge so generic operational
 * retests cannot starve academic weaknesses. Examiner prompts/rubrics remain hidden from the learner.
 */
export async function runCosUniversityContinuousLearning(options: {
  now?: Date
  maxStudyPlans?: number
} = {}): Promise<CosUniversityContinuousLearningSummary> {
  const now = options.now instanceof Date ? options.now : new Date()
  const slotKey = cosUniversityContinuousSlotKey(now)
  if (process.env.COS_UNIVERSITY_CONTINUOUS_ENABLED !== 'true') {
    return emptySummary({ enabled: false, claimed: false, slotKey, status: 'disabled' })
  }

  const readiness = autonomousLearningReadiness()
  if (!readiness.autonomousEnabled) {
    return emptySummary({ enabled: true, claimed: false, slotKey, status: 'error', errors: ['autonomous_learning_disabled'] })
  }

  const claim = await claimContinuousSlot(slotKey, now)
  if (!claim) return emptySummary({ enabled: true, claimed: false, slotKey, status: 'already_claimed' })

  const summary = emptySummary({ enabled: true, claimed: true, slotKey, status: 'idle' })
  const attemptedPlanIds: string[] = []
  try {
    const remediation = await ensureCosUniversityExamFailureRemediationPlans({ maxPlans: 4 })
    summary.examFailuresPrioritized = remediation.activePlans.length

    // Ask for a wider planning window than the execution cap so cooldowns on high-priority work do
    // not starve the rest of the curriculum.
    const planning = await runCosUniversityPlanningCycle({ now, maxPlans: 12 })
    summary.errors.push(...planning.errors)

    const activeById = new Map<string, (typeof planning.activePlans)[number]>()
    for (const plan of [...remediation.activePlans, ...planning.activePlans]) {
      if (!activeById.has(plan.id)) activeById.set(plan.id, plan)
    }
    const remediationPlanIds = new Set(remediation.activePlans.map(plan => plan.id))
    const activePlans = [...activeById.values()]
      .sort((a, b) =>
        Number(remediationPlanIds.has(b.id)) - Number(remediationPlanIds.has(a.id))
        || b.priority - a.priority
        || a.planKey.localeCompare(b.planKey),
      )
    summary.planned = activePlans.length

    const eligibleIds = await loadEligiblePlanIds(activePlans.map(plan => plan.id), now)
    const maxStudyPlans = Math.max(1, Math.min(6, Math.floor(options.maxStudyPlans || 4)))
    const eligiblePlans = activePlans.filter(plan => eligibleIds.has(plan.id)).slice(0, maxStudyPlans)
    summary.eligible = eligiblePlans.length
    if (!eligiblePlans.length) {
      await finishContinuousSlot(claim.id, new Date(), summary, attemptedPlanIds)
      return summary
    }

    const eligibleKeys = new Set(eligiblePlans.map(plan => plan.planKey))
    const allSignals = [...remediation.gapSignals, ...planning.gapSignals]
    const signals = allSignals.filter(signal =>
      [...eligibleKeys].some(planKey => signalMatchesPlan(signal, planKey)),
    )
    const gaps = generateKnowledgeGaps(signals)
    summary.gapsConsidered = gaps.length
    if (!gaps.length) {
      await finishContinuousSlot(claim.id, new Date(), summary, attemptedPlanIds)
      return summary
    }

    const store = createSupabaseCOSStores()?.continuousLearning
    if (!store) throw new Error('persistent_learning_store_unavailable')
    const approvedUrls = parseApprovedLearningUrls()
    const liveAdapters = createLiveLearningAdapters()
    const adapters = [
      ...(approvedUrls.length ? [approvedUrlLearningAdapter(approvedUrls)] : []),
      ...liveAdapters,
    ]
    const director = new ContinuousLearningDirector(store, ZERO_EXTERNAL_COST_POLICY)
    const cycle = new ContinuousLearningCycle(director, adapters)
    const result = await cycle.run(gaps, 0)

    summary.status = 'learned'
    summary.documentsAcquired = result.documentsAcquired
    summary.accepted = result.accepted
    summary.probationary = result.probationary
    summary.sourceErrors = result.sourceErrors
    attemptedPlanIds.push(...eligiblePlans.map(plan => plan.id))
    summary.plansAttempted = await markCosUniversityStudyPlansAttempted(attemptedPlanIds, new Date())
    await finishContinuousSlot(claim.id, new Date(), summary, attemptedPlanIds)
    return summary
  } catch (error) {
    summary.status = 'error'
    summary.errors.push(describeError(error))
    try {
      await finishContinuousSlot(claim.id, new Date(), summary, attemptedPlanIds)
    } catch (finishError) {
      summary.errors.push(`finish:${describeError(finishError)}`)
    }
    return summary
  }
}
