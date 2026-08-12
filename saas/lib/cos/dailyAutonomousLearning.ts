import type { ContinuousLearningSourceAdapter } from '@/lib/cos-core/layers/learning/cycle'
import { ContinuousLearningCycle } from '@/lib/cos-core/layers/learning/cycle'
import { ContinuousLearningDirector, type ContinuousLearningStore, type KnowledgeGap } from '@/lib/cos-core/layers/learning'
import { createLiveLearningAdapters } from '@/lib/cos-core/layers/learning/liveSources'
import { createSupabaseCOSStores } from '@/lib/cos-core/storage/supabase'
import { generateKnowledgeGaps, type KnowledgeGapSignal } from '@/lib/cos-core/layers/learning/gaps'
import { generateDynamicKnowledgeGaps } from '@/lib/cos-core/layers/learning/dynamicGaps'
import type { MiningRunSummary } from './mining/types'

export type DailyLearningResult = {
  status: 'skipped' | 'learned'
  skipReason?: string
  approvedUrls: number
  autonomousGaps: number
  curriculumGaps: number
  corpusExpansionGaps: number
  retainedKnowledge: number
  liveSourceAdapters: number
  gapsConsidered: number
  documentsAcquired: number
  accepted: number
  rejected: Record<string, number>
  sourceErrors: Record<string, number>
  externalCostUsd: number
}

export type ContinuousLearningTelemetrySink = { record(metric: Record<string, unknown>): Promise<void> | void }

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
  maxCandidatesPerCycle: 80,
  maxExternalCostUsdPerCycle: 0,
}

export function autonomousLearningReadiness(env: NodeJS.ProcessEnv = process.env) {
  const autonomousEnabled = env.COS_AUTONOMOUS_LEARNING_ENABLED === 'true'
  const liveSourcesEnabled = env.COS_LIVE_SOURCES_ENABLED !== 'false'
  const approvedUrls = String(env.COS_APPROVED_LEARNING_URLS || '').split(',').map(v => v.trim()).filter(Boolean).length
  const liveAdapters = createLiveLearningAdapters(env).length
  const youtubeConfigured = Boolean(String(env.YOUTUBE_API_KEY || '').trim())
  const youtubeTranscriptConfigured = youtubeConfigured && Boolean(String(env.YOUTUBE_TRANSCRIPT_API_URL || '').trim())
  const techFeedCount = String(env.COS_TECH_RSS_FEEDS || '').split(',').map(v => v.trim()).filter(Boolean).length
  return {
    autonomousEnabled,
    liveSourcesEnabled,
    approvedUrls,
    liveAdapters,
    youtubeConfigured,
    youtubeTranscriptConfigured,
    techFeedCount,
    ready: autonomousEnabled && (liveAdapters > 0 || approvedUrls > 0),
    warnings: [
      ...(!autonomousEnabled ? ['COS_AUTONOMOUS_LEARNING_ENABLED is not true'] : []),
      ...(autonomousEnabled && !liveSourcesEnabled && approvedUrls === 0 ? ['External learning was explicitly disabled with COS_LIVE_SOURCES_ENABLED=false'] : []),
      ...(liveSourcesEnabled && !youtubeConfigured ? ['YouTube learning is unavailable because YOUTUBE_API_KEY is not configured'] : []),
      ...(youtubeConfigured && !youtubeTranscriptConfigured ? ['YouTube metadata learning is enabled; full transcript ingestion requires an authorized transcript source'] : []),
    ],
  }
}

function autonomousLearningIsExplicitlyEnabled(): boolean {
  return process.env.COS_AUTONOMOUS_LEARNING_ENABLED === 'true'
}

export function parseApprovedLearningUrls(): string[] {
  return String(process.env.COS_APPROVED_LEARNING_URLS || '').split(',').map(v => v.trim()).filter(Boolean)
}

function miningGap(summary: MiningRunSummary): KnowledgeGap {
  return {
    id: `daily-mining-${summary.run_id}`,
    subject: 'SignalBoost operational behavior',
    question: 'What reusable operational knowledge can COS learn from the latest mining run?',
    portableIds: ['cos'],
    expectedReuse: 5,
    expectedAvoidedCostUsd: 0.25,
    urgency: 40,
    evidence: [`users_processed=${summary.users_processed}`, `rules_found=${summary.rules_found}`],
  }
}

export function recurringTechnologyCurriculum(): KnowledgeGap[] {
  const topics: Array<[string, string, string, number]> = [
    ['multi-tenant-saas-performance', 'Multi-tenant SaaS performance isolation', 'What concrete mechanisms cause tenant-specific API p95 latency while shared database CPU and memory remain normal, including connection pools, lock contention, worker queues, per-tenant rate limits, shard or partition hotspots, authorization policy overhead, cache behavior, and downstream dependencies?', 95],
    ['sre-observability', 'SRE and observability', 'What current read-only telemetry, tracing, queueing, saturation, tail-latency, and distributed-systems techniques best distinguish architectural bottlenecks without changing production?', 92],
    ['database-performance', 'Database and data-layer performance', 'What current techniques diagnose query-plan regressions, lock waits, connection-pool exhaustion, hot partitions, row-level security overhead, cache misses, replication lag, and tenant data skew?', 90],
    ['cloud-kubernetes', 'Cloud and Kubernetes reliability', 'What current AWS, Azure, GCP, Kubernetes, service-mesh, autoscaling, scheduling, networking, and noisy-neighbor behaviors matter for reliable multi-tenant services?', 87],
    ['distributed-systems', 'Distributed systems architecture', 'What current patterns and failure modes matter for queues, caches, concurrency control, backpressure, rate limiting, sharding, consistency, retries, and tail latency?', 86],
    ['cybersecurity', 'Enterprise cybersecurity', 'What current defensive security, identity, authorization, supply-chain, cloud, container, and AI-agent security practices should enterprise software reason about?', 84],
    ['ai-agent-engineering', 'AI agents and local inference', 'What current techniques improve autonomous agents, retrieval quality, memory, provenance, semantic caching, local open-model inference, evaluation, and safe tool execution?', 83],
    ['enterprise-tech-news', 'Enterprise technology developments', 'What recent developments in enterprise software, databases, cloud infrastructure, DevOps, SRE, cybersecurity, and AI materially change engineering practice?', 78],
  ]
  return topics.map(([id, subject, question, urgency]) => ({
    id: `curriculum:${id}`,
    subject,
    question,
    portableIds: ['cos'],
    expectedReuse: 20,
    expectedAvoidedCostUsd: 1,
    urgency,
    evidence: ['recurring COS technology curriculum'],
  }))
}

function miningAdapter(summary: MiningRunSummary): ContinuousLearningSourceAdapter {
  return {
    kind: 'work_experience',
    async acquire(gap) {
      if (!gap.id.startsWith('daily-mining-')) return []
      return [{
        sourceKind: 'work_experience',
        sourceUri: `signalboost://mining/${summary.run_id}`,
        sourceTitle: 'SignalBoost daily mining run',
        observedAt: new Date().toISOString(),
        subject: gap.subject,
        text: JSON.stringify(summary),
        evidence: gap.evidence,
      }]
    },
  }
}

export function approvedUrlLearningAdapter(urls: string[]): ContinuousLearningSourceAdapter {
  return {
    kind: 'approved_public_web',
    async acquire(gap) {
      if (gap.id.startsWith('daily-mining-')) return []
      const documents: any[] = []
      for (const url of urls.slice(0, 10)) {
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
          if (!response.ok) continue
          const text = (await response.text()).replace(/\s+/g, ' ').trim().slice(0, 12000)
          if (text) documents.push({
            sourceKind: 'approved_public_web',
            sourceUri: url,
            sourceTitle: url,
            observedAt: new Date().toISOString(),
            subject: gap.subject,
            text,
            evidence: [url],
          })
        } catch (error) {
          console.warn('cosLearning: approved URL acquisition failed', { url, error: error instanceof Error ? error.message : String(error) })
        }
      }
      return documents
    },
  }
}

async function runLearningCycleWithTelemetry(
  run: () => Promise<{ gapsConsidered: number; documentsAcquired: number; accepted: number; rejected: Record<string, number>; sourceErrors: Record<string, number>; externalCostUsd: number }>,
  telemetry: ContinuousLearningTelemetrySink,
) {
  const startedAt = Date.now()
  const result = await run()
  await telemetry.record({ event: 'cos_continuous_learning_cycle', latencyMs: Date.now() - startedAt, ...result })
  return result
}

async function loadQueuedReasoningGaps(): Promise<{ ids: string[]; signals: KnowledgeGapSignal[] }> {
  const db = createSupabaseCOSStores() ? (await import('@/lib/cos-core/storage/supabase')).cosServiceDb() : null
  if (!db) return { ids: [], signals: [] }
  try {
    const { data } = await db.from('cos_learning_gaps').select('*').in('status', ['pending', 'failed']).order('last_seen_at', { ascending: false }).limit(25)
    const rows = data ?? []
    return {
      ids: rows.map((r: any) => String(r.id)),
      signals: rows.map((r: any) => ({
        taskId: String(r.task_id || 'support'),
        subject: String(r.subject || ''),
        capability: String(r.capability || 'general_reasoning'),
        objective: String(r.question || ''),
        confidence: Number(r.confidence || 0),
        escalated: true,
        succeeded: false,
        repeatedCount: Number(r.repeated_count || 1),
        evidence: r.escalation_reason ? [String(r.escalation_reason)] : [],
        portableIds: ['cos'],
      })),
    }
  } catch {
    return { ids: [], signals: [] }
  }
}

async function markQueuedReasoningGaps(ids: string[], accepted: number) {
  if (!ids.length) return
  const db = (await import('@/lib/cos-core/storage/supabase')).cosServiceDb()
  if (!db) return
  try {
    await db.from('cos_learning_gaps').update({
      status: accepted > 0 ? 'resolved' : 'failed',
      resolved_at: accepted > 0 ? new Date().toISOString() : null,
      last_seen_at: new Date().toISOString(),
    }).in('id', ids)
  } catch {}
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
  const readiness = autonomousLearningReadiness()
  if (!autonomousLearningIsExplicitlyEnabled()) {
    console.warn('[cos-daily-learning-skipped]', JSON.stringify(readiness))
    return {
      status: 'skipped',
      skipReason: 'autonomous_learning_disabled',
      approvedUrls: readiness.approvedUrls,
      autonomousGaps: 0,
      curriculumGaps: 0,
      corpusExpansionGaps: 0,
      retainedKnowledge: 0,
      liveSourceAdapters: readiness.liveAdapters,
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
    console.warn('[cos-daily-learning-skipped]', JSON.stringify({ ...readiness, reason: 'persistent_store_unavailable' }))
    return {
      status: 'skipped',
      skipReason: 'persistent_store_unavailable',
      approvedUrls: readiness.approvedUrls,
      autonomousGaps: 0,
      curriculumGaps: 0,
      corpusExpansionGaps: 0,
      retainedKnowledge: 0,
      liveSourceAdapters: readiness.liveAdapters,
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
  const reasoningGaps = generateKnowledgeGaps(queued.signals)
  const dynamic = await generateDynamicKnowledgeGaps(12)
  const reasoningKeys = new Set(reasoningGaps.map(gap => `${gap.subject.toLowerCase()}::${gap.question.toLowerCase()}`))
  const corpusExpansionGaps = dynamic.gaps.filter(gap => !reasoningKeys.has(`${gap.subject.toLowerCase()}::${gap.question.toLowerCase()}`))
  const autonomousGaps = [...reasoningGaps, ...corpusExpansionGaps].slice(0, 12)
  const curriculum = recurringTechnologyCurriculum()
  const gaps = [miningGap(input.miningSummary), ...curriculum, ...autonomousGaps]
  const liveAdapters = createLiveLearningAdapters()
  const adapters = [
    miningAdapter(input.miningSummary),
    ...(approvedUrls.length ? [approvedUrlLearningAdapter(approvedUrls)] : []),
    ...liveAdapters,
    ...(input.adapters ?? []),
  ]

  console.info('[cos-learning-readiness]', JSON.stringify({
    ...readiness,
    queuedGaps: queued.signals.length,
    generatedGaps: autonomousGaps.length,
    corpusExpansionGaps: corpusExpansionGaps.length,
    retainedKnowledge: dynamic.retained,
    curriculumGaps: curriculum.length,
    adapterKinds: adapters.map(a => a.id ?? a.kind),
  }))

  const director = new ContinuousLearningDirector(persistentStore, ZERO_LLM_POLICY)
  const cycle = new ContinuousLearningCycle(director, adapters)
  const result = await runLearningCycleWithTelemetry(() => cycle.run(gaps, 0), input.telemetry ?? consoleTelemetry)
  await markQueuedReasoningGaps(queued.ids, result.accepted)

  return {
    status: 'learned',
    approvedUrls: approvedUrls.length,
    autonomousGaps: autonomousGaps.length,
    curriculumGaps: curriculum.length,
    corpusExpansionGaps: corpusExpansionGaps.length,
    retainedKnowledge: dynamic.retained,
    liveSourceAdapters: liveAdapters.length,
    ...result,
    externalCostUsd: 0,
  }
}
