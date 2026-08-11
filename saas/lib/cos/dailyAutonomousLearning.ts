import type { ContinuousLearningSourceAdapter } from '@/lib/cos-core/layers/learning/cycle'
import { ContinuousLearningCycle } from '@/lib/cos-core/layers/learning/cycle'
import { ContinuousLearningDirector, type ContinuousLearningStore } from '@/lib/cos-core/layers/learning'
import { createLiveLearningAdapters } from '@/lib/cos-core/layers/learning/liveSources'
import { createSupabaseCOSStores } from '@/lib/cos-core/storage/supabase'
import { generateKnowledgeGaps, type KnowledgeGapSignal } from '@/lib/cos-core/layers/learning/gaps'
import type { MiningRunSummary } from './mining/types'

export type DailyLearningResult = {
  status: 'skipped' | 'learned'
  approvedUrls: number
  autonomousGaps: number
  gapsConsidered: number
  documentsAcquired: number
  accepted: number
  rejected: Record<string, number>
  sourceErrors: Record<string, number>
  externalCostUsd: number
}

export type ContinuousLearningTelemetrySink = {
  record(metric: Record<string, unknown>): Promise<void> | void
}

const ZERO_LLM_POLICY = {
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
  maxCandidatesPerCycle: 50,
  maxExternalCostUsdPerCycle: 0,
}

function autonomousLearningIsExplicitlyEnabled(): boolean {
  return process.env.COS_AUTONOMOUS_LEARNING_ENABLED === 'true'
}

function parseApprovedLearningUrls(): string[] {
  return String(process.env.COS_APPROVED_LEARNING_URLS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

function miningGap(summary: MiningRunSummary) {
  return {
    id: `daily-mining-${summary.started_at}`,
    subject: 'SignalBoost operational behavior',
    question: 'What reusable operational knowledge can COS learn from the latest mining run?',
    portableIds: ['cos'],
    expectedReuse: 5,
    expectedAvoidedCostUsd: 0.25,
    urgency: 40,
    evidence: [`users_processed=${summary.users_processed}`, `rules_found=${summary.rules_found}`],
  }
}

function miningAdapter(summary: MiningRunSummary): ContinuousLearningSourceAdapter {
  return {
    kind: 'work_experience',
    async acquire(gap) {
      if (!gap.id.startsWith('daily-mining-')) return []
      return [{
        sourceKind: 'work_experience',
        sourceUri: `signalboost://mining/${summary.started_at}`,
        sourceTitle: 'SignalBoost daily mining run',
        observedAt: summary.started_at,
        subject: gap.subject,
        text: JSON.stringify(summary),
        evidence: gap.evidence,
      }]
    },
  }
}

function approvedUrlLearningAdapter(urls: string[]): ContinuousLearningSourceAdapter {
  return {
    kind: 'approved_public_web',
    async acquire(gap) {
      if (gap.id.startsWith('daily-mining-')) return []
      const documents = [] as Array<{
        sourceKind: 'approved_public_web'
        sourceUri: string
        sourceTitle: string
        observedAt: string
        subject: string
        text: string
        evidence: string[]
      }>
      for (const url of urls.slice(0, 10)) {
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
        if (!response.ok) continue
        const text = (await response.text()).replace(/\s+/g, ' ').trim().slice(0, 12000)
        if (!text) continue
        documents.push({ sourceKind: 'approved_public_web', sourceUri: url, sourceTitle: url, observedAt: new Date().toISOString(), subject: gap.subject, text, evidence: [url] })
      }
      return documents
    },
  }
}

async function runLearningCycleWithTelemetry(
  run: () => Promise<{ gapsConsidered:number; documentsAcquired:number; accepted:number; rejected:Record<string,number>; sourceErrors:Record<string,number>; externalCostUsd:number }>,
  telemetry: ContinuousLearningTelemetrySink,
) {
  const startedAt = Date.now()
  const result = await run()
  await telemetry.record({
    event: 'cos_continuous_learning_cycle',
    latencyMs: Date.now() - startedAt,
    ...result,
  })
  return result
}

async function loadQueuedReasoningGaps(): Promise<{ ids: string[]; signals: KnowledgeGapSignal[] }> {
  const db = createSupabaseCOSStores() ? (await import('@/lib/cos-core/storage/supabase')).cosServiceDb() : null
  if (!db) return { ids: [], signals: [] }
  try {
    const { data } = await db.from('cos_learning_gaps').select('*').in('status', ['pending','failed']).order('last_seen_at', { ascending:false }).limit(25)
    const rows = data ?? []
    return {
      ids: rows.map((row:any) => String(row.id)),
      signals: rows.map((row:any) => ({
        taskId:String(row.task_id||'support'), subject:String(row.subject||''), capability:String(row.capability||'general_reasoning'), objective:String(row.question||''), confidence:Number(row.confidence||0), escalated:true, succeeded:false, repeatedCount:Number(row.repeated_count||1), evidence:row.escalation_reason?[String(row.escalation_reason)]:[], portableIds:['cos'],
      })),
    }
  } catch { return { ids: [], signals: [] } }
}

async function markQueuedReasoningGaps(ids:string[], accepted:number){
  if(!ids.length)return
  const db=(await import('@/lib/cos-core/storage/supabase')).cosServiceDb(); if(!db)return
  try{await db.from('cos_learning_gaps').update({status:accepted>0?'resolved':'failed',resolved_at:accepted>0?new Date().toISOString():null,last_seen_at:new Date().toISOString()}).in('id',ids)}catch{}
}

const consoleTelemetry: ContinuousLearningTelemetrySink = {
  record(metric) {
    console.info('[cos-daily-learning]', JSON.stringify(metric))
  },
}

export async function runDailyAutonomousLearning(input: {
  miningSummary: MiningRunSummary
  store?: ContinuousLearningStore
  adapters?: ContinuousLearningSourceAdapter[]
  telemetry?: ContinuousLearningTelemetrySink
  approvedUrls?: string[]
  gapSignals?: KnowledgeGapSignal[]
}): Promise<DailyLearningResult> {
  if (!autonomousLearningIsExplicitlyEnabled()) {
    return {
      status: 'skipped',
      approvedUrls: 0,
      autonomousGaps: 0,
      gapsConsidered: 0,
      documentsAcquired: 0,
      accepted: 0,
      rejected: {},
      sourceErrors: {},
      externalCostUsd: 0,
    }
  }

  const persistentStore = input.store ?? createSupabaseCOSStores()?.continuousLearning
  if (!persistentStore) {
    return {
      status: 'skipped',
      approvedUrls: 0,
      autonomousGaps: 0,
      gapsConsidered: 0,
      documentsAcquired: 0,
      accepted: 0,
      rejected: {},
      sourceErrors: {},
      externalCostUsd: 0,
    }
  }

  const queued = input.gapSignals ? { ids: [], signals: input.gapSignals } : await loadQueuedReasoningGaps()
  const approvedUrls = input.approvedUrls ?? parseApprovedLearningUrls()
  const autonomousGaps = generateKnowledgeGaps(queued.signals)
  const gaps = [miningGap(input.miningSummary), ...autonomousGaps]
  const adapters = [
    miningAdapter(input.miningSummary),
    ...(approvedUrls.length ? [approvedUrlLearningAdapter(approvedUrls)] : []),
    ...createLiveLearningAdapters(),
    ...(input.adapters ?? []),
  ]
  const director = new ContinuousLearningDirector(persistentStore, ZERO_LLM_POLICY)
  const cycle = new ContinuousLearningCycle(director, adapters)
  const result = await runLearningCycleWithTelemetry(
    () => cycle.run(gaps, 0),
    input.telemetry ?? consoleTelemetry,
  )

  await markQueuedReasoningGaps(queued.ids, result.accepted)

  return {
    status: 'learned',
    approvedUrls: approvedUrls.length,
    autonomousGaps: autonomousGaps.length,
    ...result,
    externalCostUsd: 0,
  }
}
