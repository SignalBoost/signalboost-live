import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

const AGENT_ID = 'cos'
const ORIGIN = 'cos_university_deliberate_practice'
const LOWER_PRIORITY_DEFERRAL_MS = 14 * 60_000
const MAX_QUEUE_ROWS = 1000
const UPDATE_BATCH_SIZE = 50

type StudyPlanRow = {
  id: string
  status: string
  attempt_count: number
  methods: unknown
  priority: number
  last_attempt_at: string | null
}

type QueueRow = {
  id: string
  metadata: Record<string, unknown> | null
  next_attempt_at: string | null
}

export type CosUniversityPracticeQueueDisciplineSummary = {
  selectedPlanIds: string[]
  queuedInspected: number
  obsoleteDiscarded: number
  lowerPriorityDeferred: number
  semantics: 'current_round_priority_without_deleting_audit_evidence'
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function hasAutomaticDeliberatePractice(methods: unknown): boolean {
  if (!Array.isArray(methods)) return false
  return methods.some(item => {
    const row = asRecord(item)
    return row.id === 'deliberate_practice' && row.execution === 'automatic_if_certifiable'
  })
}

function currentPracticeRound(plan: Pick<StudyPlanRow, 'attempt_count'>): number {
  return Math.max(1, Math.floor(Number(plan.attempt_count || 1)))
}

function batches<T>(values: readonly T[], size = UPDATE_BATCH_SIZE): T[][] {
  const boundedSize = Math.max(1, Math.floor(size))
  const result: T[][] = []
  for (let index = 0; index < values.length; index += boundedSize) {
    result.push(values.slice(index, index + boundedSize))
  }
  return result
}

export function classifyCosUniversityQueuedPractice(args: {
  metadata: Record<string, unknown> | null
  nextAttemptAt: string | null
  plan: Pick<StudyPlanRow, 'id' | 'status' | 'attempt_count' | 'methods'> | null
  selectedPlanIds: ReadonlySet<string>
  now: Date
}): 'keep' | 'discard_obsolete' | 'defer_lower_priority' {
  const metadata = asRecord(args.metadata)
  const planId = String(metadata.universityPlanId || '').trim()
  const practiceRound = Number(metadata.practiceRound)
  const plan = args.plan

  if (!planId || !plan || plan.id !== planId || plan.status !== 'studying' || !hasAutomaticDeliberatePractice(plan.methods)) {
    return 'discard_obsolete'
  }
  if (!Number.isFinite(practiceRound) || Math.floor(practiceRound) !== currentPracticeRound(plan)) {
    return 'discard_obsolete'
  }
  if (args.selectedPlanIds.has(planId)) return 'keep'

  const nextAttemptAt = Date.parse(String(args.nextAttemptAt || ''))
  if (!Number.isFinite(nextAttemptAt) || nextAttemptAt <= args.now.getTime()) return 'defer_lower_priority'
  return 'keep'
}

async function loadCurrentPlans(limit: number): Promise<StudyPlanRow[]> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_study_plans')
    .select('id,status,attempt_count,methods,priority,last_attempt_at')
    .eq('agent_id', AGENT_ID)
    .eq('status', 'studying')
    .gt('attempt_count', 0)
    .order('priority', { ascending: false })
    .order('last_attempt_at', { ascending: false })
    .limit(Math.max(8, Math.min(100, limit * 8)))
  if (result.error) throw result.error
  return ((result.data || []) as StudyPlanRow[]).filter(plan => hasAutomaticDeliberatePractice(plan.methods))
}

async function loadQueuedPractice(): Promise<QueueRow[]> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_active_practice_queue')
    .select('id,metadata,next_attempt_at')
    .eq('status', 'queued')
    .eq('generation_source', 'curated')
    .contains('metadata', { origin: ORIGIN })
    .order('created_at', { ascending: true })
    .limit(MAX_QUEUE_ROWS)
  if (result.error) throw result.error
  return (result.data || []) as QueueRow[]
}

async function loadReferencedPlans(planIds: string[]): Promise<Map<string, StudyPlanRow>> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  if (!planIds.length) return new Map()
  const result = await db.from('cos_university_study_plans')
    .select('id,status,attempt_count,methods,priority,last_attempt_at')
    .in('id', [...new Set(planIds)])
  if (result.error) throw result.error
  return new Map(((result.data || []) as StudyPlanRow[]).map(plan => [plan.id, plan] as const))
}

async function discardObsoletePractice(ids: string[], nowIso: string): Promise<number> {
  if (!ids.length) return 0
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  let updated = 0
  for (const batch of batches(ids)) {
    const result = await db.from('cos_active_practice_queue').update({
      status: 'discarded',
      started_at: null,
      completed_at: nowIso,
      last_error: 'university_practice_superseded_by_current_study_round',
      updated_at: nowIso,
    }).in('id', batch).eq('status', 'queued').select('id')
    if (result.error) throw result.error
    updated += result.data?.length || 0
  }
  return updated
}

async function deferLowerPriorityPractice(ids: string[], now: Date, nowIso: string): Promise<number> {
  if (!ids.length) return 0
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const nextAttemptAt = new Date(now.getTime() + LOWER_PRIORITY_DEFERRAL_MS).toISOString()
  let updated = 0
  for (const batch of batches(ids)) {
    const result = await db.from('cos_active_practice_queue').update({
      next_attempt_at: nextAttemptAt,
      last_error: 'university_practice_deferred_for_higher_academic_priority',
      updated_at: nowIso,
    }).in('id', batch).eq('status', 'queued').select('id')
    if (result.error) throw result.error
    updated += result.data?.length || 0
  }
  return updated
}

export async function disciplineCosUniversityPracticeQueue(options: {
  now?: Date
  maxActivePlans?: number
} = {}): Promise<CosUniversityPracticeQueueDisciplineSummary> {
  const now = options.now instanceof Date ? options.now : new Date()
  const maxActivePlans = Math.max(1, Math.min(4, Math.floor(options.maxActivePlans || 1)))
  const currentPlans = await loadCurrentPlans(maxActivePlans)
  const selectedPlanIds = currentPlans.slice(0, maxActivePlans).map(plan => plan.id)
  const selected = new Set(selectedPlanIds)
  const queued = await loadQueuedPractice()
  const referencedPlanIds = queued
    .map(row => String(asRecord(row.metadata).universityPlanId || '').trim())
    .filter(Boolean)
  const plansById = await loadReferencedPlans(referencedPlanIds)
  const obsoleteIds: string[] = []
  const lowerPriorityIds: string[] = []

  for (const row of queued) {
    const metadata = asRecord(row.metadata)
    const planId = String(metadata.universityPlanId || '').trim()
    const disposition = classifyCosUniversityQueuedPractice({
      metadata,
      nextAttemptAt: row.next_attempt_at,
      plan: plansById.get(planId) || null,
      selectedPlanIds: selected,
      now,
    })
    if (disposition === 'discard_obsolete') obsoleteIds.push(row.id)
    else if (disposition === 'defer_lower_priority') lowerPriorityIds.push(row.id)
  }

  const nowIso = now.toISOString()
  const obsoleteDiscarded = await discardObsoletePractice(obsoleteIds, nowIso)
  const lowerPriorityDeferred = await deferLowerPriorityPractice(lowerPriorityIds, now, nowIso)

  return {
    selectedPlanIds,
    queuedInspected: queued.length,
    obsoleteDiscarded,
    lowerPriorityDeferred,
    semantics: 'current_round_priority_without_deleting_audit_evidence',
  }
}
