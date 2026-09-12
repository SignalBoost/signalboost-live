// saas/lib/ai/cos/cosUniversityContinuousLearning.ts
import { ContinuousLearningCycle, type LearningCycleResult } from '@/lib/cos-core/layers/learning/cycle'
import { ContinuousLearningDirector } from '@/lib/cos-core/layers/learning'
import { createLiveLearningAdapters } from '@/lib/cos-core/layers/learning/liveSources'
import {
  generateKnowledgeGaps,
  knowledgeGapIdForSignal,
  type KnowledgeGapSignal,
} from '@/lib/cos-core/layers/learning/gaps'
import { createSupabaseCOSStores, cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  approvedUrlLearningAdapter,
  autonomousLearningReadiness,
  parseApprovedLearningUrls,
} from '@/lib/cos/dailyAutonomousLearning'
import {
  cooledDownSourceIds,
  withoutCooledDownSources,
} from './cosUniversityLearningSourceCooldown.ts'
import {
  orderStudyPlansBySupply,
  studyGapHistoryFromDiagnostics,
} from './cosUniversityStudySupplyPriority.ts'
import { runCosUniversityPlanningCycle } from './cosUniversityStore.ts'
import { ensureCosUniversityExamFailureRemediationPlans } from './cosUniversityExamRemediation.ts'
import {
  recordAcceptedCosUniversityStudyAttempts,
  type CosUniversityAcceptedStudyProofInput,
} from './cosUniversityStudyProof.ts'
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
  rejected: Record<string, number>
  sourceErrors: Record<string, number>
  gapDiagnostics: LearningCycleResult['gapDiagnostics']
  errors: string[]
  semantics: 'continuous_machine_learning_no_rest_exam_isolated'
}

type ContinuousRunRow = { id: string }
type StudyPlanStateRow = { id: string; status: string; last_attempt_at: string | null }
type EligiblePlan = Readonly<{ id: string; planKey: string }>

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
    rejected: {},
    sourceErrors: {},
    gapDiagnostics: {},
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
    rejected_counts: summary.rejected,
    source_errors: summary.sourceErrors,
    gap_diagnostics: summary.gapDiagnostics,
    errors: summary.errors,
    completed_at: now.toISOString(),
    updated_at: now.toISOString(),
  }).eq('id', runId)
  if (result.error) throw result.error
}

/**
 * Recent completed cycles for this agent's own lane, newest first. Only gap_diagnostics is read:
 * bounded per-gap counts, never study text. A read failure degrades to "no history", which restores
 * the previous ordering rather than blocking the cycle.
 */
async function loadRecentLaneHistory(agentId: string, limit = 8): Promise<{
  gaps: ReturnType<typeof studyGapHistoryFromDiagnostics>
  sourceErrors: unknown[]
}> {
  const empty = { gaps: studyGapHistoryFromDiagnostics([]), sourceErrors: [] as unknown[] }
  const db = cosServiceDb()
  if (!db) return empty
  const result = await db.from('cos_university_continuous_runs')
    .select('slot_key,gap_diagnostics,source_errors')
    .eq('status', 'completed')
    .order('started_at', { ascending: false })
    .limit(Math.max(2, Math.min(80, Math.floor(limit) * 2)))
  if (result.error) return empty
  const rows = (result.data || []) as Array<{ slot_key: string; gap_diagnostics: unknown; source_errors: unknown }>
  // COS writes `<window>`; every other agent writes `<window>:<agentId>`. Matching the suffix keeps
  // one agent's barren history from reordering another agent's plans.
  const lane = rows.filter(row => {
    const slotKey = String(row.slot_key || '')
    // `2026-09-12T01:45` is COS's own window; `2026-09-12T01:45:<agentId>` belongs to another agent.
    return agentId === 'cos' ? slotKey.split(':').length === 2 : slotKey.endsWith(`:${agentId}`)
  })
  const window = lane.slice(0, Math.max(1, Math.floor(limit)))
  return {
    gaps: studyGapHistoryFromDiagnostics(window.map(row => row.gap_diagnostics)),
    sourceErrors: window.map(row => row.source_errors),
  }
}

async function loadEligiblePlanIds(planIds: string[], now: Date, agentId: string): Promise<Set<string>> {
  if (!planIds.length) return new Set()
  const db = cosServiceDb()
  if (!db) return new Set()
  const result = await db.from('cos_university_study_plans')
    .select('id,status,last_attempt_at')
    .eq('agent_id', agentId)
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

export function universityStudyProofsFromAcceptedLearning(
  eligiblePlans: readonly EligiblePlan[],
  signals: readonly KnowledgeGapSignal[],
  acceptedGapIds: readonly string[],
  acceptedAt: string,
): CosUniversityAcceptedStudyProofInput[] {
  const accepted = new Set(acceptedGapIds)
  if (!accepted.size) return []
  return eligiblePlans.flatMap(plan => {
    const refs = [...new Set(signals
      .filter(signal => signalMatchesPlan(signal, plan.planKey))
      .map(signal => knowledgeGapIdForSignal(signal))
      .filter(gapId => accepted.has(gapId)))]
    return refs.length ? [{ planId: plan.id, evidenceRefs: refs, acceptedAt }] : []
  })
}

/**
 * Machine-native COS University learning lane.
 *
 * This is intentionally a frequent bounded sweep, not a human study session. It selects current
 * University work, respects a per-plan cooldown to avoid repeatedly rereading the same objective,
 * acquires only the source classes chosen by the Learning Strategist, and persists attempts. A study
 * attempt advances only when the governed learning cycle actually retains accepted evidence for that
 * exact plan. Counter advancement and the corresponding durable study proof are one fenced update;
 * retrieved-but-rejected, probationary, duplicate, or otherwise unretained material does not advance
 * the study round or unlock fresh practice. Fresh independent exam failures get their own high-priority
 * remediation bridge so generic operational retests cannot starve academic weaknesses. Examiner
 * prompts/rubrics remain hidden from the learner. The run ledger stores only bounded per-gap outcome
 * counts (never source text or hidden exam material) so rejected study can be diagnosed without
 * weakening admission policy.
 */
export async function runCosUniversityContinuousLearning(options: {
  agentId?: string
  now?: Date
  maxStudyPlans?: number
} = {}): Promise<CosUniversityContinuousLearningSummary> {
  const now = options.now instanceof Date ? options.now : new Date()
  const agentId = String(options.agentId || 'cos').trim()
  const baseSlotKey = cosUniversityContinuousSlotKey(now)
  const slotKey = agentId === 'cos' ? baseSlotKey : `${baseSlotKey}:${agentId || 'invalid'}`
  if (!/^[A-Za-z0-9._-]{1,180}$/.test(agentId)) {
    return emptySummary({ enabled: true, claimed: false, slotKey, status: 'error', errors: ['valid_agent_id_required'] })
  }
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
    const remediation = await ensureCosUniversityExamFailureRemediationPlans({ agentId, maxPlans: 4, now })
    summary.examFailuresPrioritized = remediation.activePlans.length

    const planning = await runCosUniversityPlanningCycle({ now, agentId, maxPlans: 12 })
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

    const eligibleIds = await loadEligiblePlanIds(activePlans.map(plan => plan.id), now, agentId)
    const maxStudyPlans = Math.max(1, Math.min(6, Math.floor(options.maxStudyPlans || 4)))
    // Many more plans are eligible than there are study slots, so the slots are the scarce resource.
    // Gaps whose sources keep returning an already-consumed pool move behind gaps that can still
    // yield. Nothing is excluded and no admission threshold changes; only the queue order does.
    const laneHistory = await loadRecentLaneHistory(agentId)
    const eligiblePlans = orderStudyPlansBySupply(
      activePlans.filter(plan => eligibleIds.has(plan.id)),
      laneHistory.gaps,
    ).slice(0, maxStudyPlans)
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
    // The in-process circuit breaker is rebuilt with the adapters every cycle, so a source that is
    // down all day is retried in full on every tick. Recent recorded failures are the only durable
    // memory of that, and a probe cycle re-admits a cooled-down source so recovery needs no deploy.
    const cooledSources = cooledDownSourceIds({ runs: laneHistory.sourceErrors, slotKey })
    const adapters = withoutCooledDownSources([
      ...(approvedUrls.length ? [approvedUrlLearningAdapter(approvedUrls)] : []),
      ...liveAdapters,
    ], cooledSources)
    const director = new ContinuousLearningDirector(store, ZERO_EXTERNAL_COST_POLICY)
    const cycle = new ContinuousLearningCycle(director, adapters)
    const result = await cycle.run(gaps, 0)

    summary.documentsAcquired = result.documentsAcquired
    summary.accepted = result.accepted
    summary.probationary = result.probationary
    summary.rejected = result.rejected
    summary.sourceErrors = result.sourceErrors
    summary.gapDiagnostics = result.gapDiagnostics
    const proofs = universityStudyProofsFromAcceptedLearning(eligiblePlans, signals, result.acceptedGapIds, now.toISOString())
    attemptedPlanIds.push(...await recordAcceptedCosUniversityStudyAttempts(proofs, new Date(), agentId))
    summary.plansAttempted = attemptedPlanIds.length
    summary.status = summary.plansAttempted > 0 ? 'learned' : 'idle'
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
