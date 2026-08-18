import type { ContinuousLearningSourceAdapter } from '@/lib/cos-core/layers/learning/cycle'
import { ContinuousLearningCycle } from '@/lib/cos-core/layers/learning/cycle'
import { ContinuousLearningDirector, type ContinuousLearningStore, type KnowledgeGap } from '@/lib/cos-core/layers/learning'
import { createLiveLearningAdapters } from '@/lib/cos-core/layers/learning/liveSources'
import { createSupabaseCOSStores } from '@/lib/cos-core/storage/supabase'
import { generateKnowledgeGaps, type KnowledgeGapSignal } from '@/lib/cos-core/layers/learning/gaps'
import { generateDynamicKnowledgeGaps } from '@/lib/cos-core/layers/learning/dynamicGaps'
import { loadCosCurriculumSignals, curriculumTrackStudyGaps } from '@/lib/ai/cos/cosCurriculumPriority'
import { FOUNDATIONAL_KNOWLEDGE_DOMAINS, nearestFoundationalSubject } from '@/lib/cos-core/layers/learning/foundational'
import { roboticsPhysicsCurriculum } from './roboticsPhysicsCurriculum.ts'
import type { MiningRunSummary } from './mining/types'

export type DailyLearningResult = {
  status: 'skipped' | 'learned'
  skipReason?: string
  approvedUrls: number
  autonomousGaps: number
  curriculumGaps: number
  corpusExpansionGaps: number
  trackStudyGaps: number
  weaknessCurriculumSignals: number
  retainedKnowledge: number
  liveSourceAdapters: number
  gapsConsidered: number
  documentsAcquired: number
  accepted: number
  probationary: number
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
  run: () => Promise<{ gapsConsidered: number; documentsAcquired: number; accepted: number; acceptedSubjects: string[]; rejected: Record<string, number>; sourceErrors: Record<string, number>; externalCostUsd: number }>,
  telemetry: ContinuousLearningTelemetrySink,
) {
  const startedAt = Date.now()
  const result = await run()
  await telemetry.record({ event: 'cos_continuous_learning_cycle', latencyMs: Date.now() - startedAt, ...result })
  return result
}

/**
 * Which queued gaps are worth STUDYING.
 *
 * `subject` is the grouping key for the whole learning loop and the search anchor every source
 * adapter uses, so it decides what acquisition goes looking for. Production data on 2026-08-17
 * showed what happens when anything is allowed through: "worse president times",
 * "show components relationships" and "computer vision subfield" were stored as durable corpus
 * subjects and re-studied daily — chat fragments sent to journal APIs as research queries.
 *
 * The bounded problem-class taxonomy (cosProblemClass) is the right key for CAPABILITY tracking —
 * "opinion and judgment", "writing and content", "cos self description" are real classes — but they
 * are not research topics, and searching journals for them returns noise. Only a foundational study
 * domain is a legitimate acquisition target, so that is the bar here. Gaps that fail it still exist
 * as capability signal; they simply are not sent to source adapters.
 */
const STUDYABLE_GAP_SUBJECTS: ReadonlySet<string> = new Set(
  FOUNDATIONAL_KNOWLEDGE_DOMAINS.map(domain => domain.subject.toLowerCase()),
)

export function isStudyableGapSubject(subject: string): boolean {
  return STUDYABLE_GAP_SUBJECTS.has(String(subject ?? '').replace(/\s+/g, ' ').trim().toLowerCase())
}

/**
 * Re-anchor a queued gap onto a real study domain rather than trusting the stored subject string.
 * Returns null when neither the subject nor its own question maps to a study domain, so the caller
 * drops the gap instead of turning a chat fragment into an acquisition query.
 */
export function normalizeQueuedGapSubject(subject: string, question: string): string | null {
  const stored = String(subject ?? '').replace(/\s+/g, ' ').trim()
  if (isStudyableGapSubject(stored)) return stored
  const text = `${String(question ?? '').trim()} ${stored}`.trim()
  const derived = text ? nearestFoundationalSubject(text) : null
  return derived && isStudyableGapSubject(derived) ? derived : null
}

/**
 * Dynamic corpus gaps are also acquisition targets.  They must cross the same bounded-subject
 * boundary as queued gaps; otherwise a fragment already present in the corpus can bypass the
 * queue hygiene and become tomorrow's search query and accepted subject.
 */
export function normalizeDynamicStudyGaps(gaps: KnowledgeGap[]): KnowledgeGap[] {
  const seen = new Set<string>()
  const normalized: KnowledgeGap[] = []
  for (const gap of gaps) {
    const subject = normalizeQueuedGapSubject(gap.subject, gap.question)
    if (!subject) continue
    const key = `${subject.toLowerCase()}::${gap.question.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(subject === gap.subject ? gap : {
      ...gap,
      subject,
      // Adapters build their external query from subject + question. Do not carry the unbounded
      // corpus fragment into that query after it has been re-anchored.
      question: `What current, verifiable evidence is relevant to ${subject}?`,
      evidence: [...(gap.evidence ?? []), `reanchored_from_subject=${String(gap.subject).slice(0, 180)}`],
    })
  }
  return normalized
}

/**
 * A gap is only resolved when its own subject produced admitted evidence. Marking every queued gap
 * resolved because the cycle accepted something somewhere closes gaps that were never answered.
 */
export function queuedGapResolution(subject: string, acceptedSubjects: string[]): 'resolved' | 'failed' {
  const value = String(subject ?? '').trim().toLowerCase()
  return acceptedSubjects.some(accepted => String(accepted ?? '').trim().toLowerCase() === value) ? 'resolved' : 'failed'
}

async function loadQueuedReasoningGaps(): Promise<{ ids: string[]; signals: KnowledgeGapSignal[] }> {
  const db = createSupabaseCOSStores() ? (await import('@/lib/cos-core/storage/supabase')).cosServiceDb() : null
  if (!db) return { ids: [], signals: [] }
  try {
    const { data } = await db.from('cos_learning_gaps').select('*').in('status', ['pending', 'failed']).order('last_seen_at', { ascending: false }).limit(25)
    const rows = data ?? []
    const usable: Array<{ row: any; subject: string }> = []
    const dropped: string[] = []
    const droppedIds: string[] = []
    for (const row of rows) {
      const stored = String(row?.subject || '')
      const subject = normalizeQueuedGapSubject(stored, String(row?.question || ''))
      if (!subject) { dropped.push(stored.slice(0, 60)); droppedIds.push(String(row?.id)); continue }
      usable.push({ row, subject })
    }
    if (dropped.length) {
      console.warn('[cos-learning-gap-subject-unstudyable]', JSON.stringify({ dropped: dropped.length, examples: dropped.slice(0, 5) }))
      // Take them out of the study window so a fragment cannot occupy a slot every cycle forever.
      // Best-effort: if the 'unstudyable' status migration has not been applied yet the update is
      // rejected and swallowed, and the gap is still correctly skipped for this cycle.
      try { await db.from('cos_learning_gaps').update({ status: 'unstudyable', last_seen_at: new Date().toISOString() }).in('id', droppedIds) } catch {}
    }
    return {
      ids: usable.map(({ row }) => String(row.id)),
      signals: usable.map(({ row, subject }) => ({
        taskId: String(row.task_id || 'support'),
        subject,
        capability: String(row.capability || 'general_reasoning'),
        objective: String(row.question || ''),
        confidence: Number(row.confidence || 0),
        escalated: true,
        succeeded: false,
        repeatedCount: Number(row.repeated_count || 1),
        evidence: row.escalation_reason ? [String(row.escalation_reason)] : [],
        portableIds: ['cos'],
      })),
    }
  } catch {
    return { ids: [], signals: [] }
  }
}

async function markQueuedReasoningGaps(
  queued: Array<{ id: string; subject: string }>,
  acceptedSubjects: string[],
) {
  if (!queued.length) return
  const db = (await import('@/lib/cos-core/storage/supabase')).cosServiceDb()
  if (!db) return
  const now = new Date().toISOString()
  const resolvedIds = queued.filter(gap => queuedGapResolution(gap.subject, acceptedSubjects) === 'resolved').map(gap => gap.id)
  const failedIds = queued.filter(gap => !resolvedIds.includes(gap.id)).map(gap => gap.id)
  try {
    if (resolvedIds.length) {
      await db.from('cos_learning_gaps').update({ status: 'resolved', resolved_at: now, last_seen_at: now }).in('id', resolvedIds)
    }
    if (failedIds.length) {
      await db.from('cos_learning_gaps').update({ status: 'failed', resolved_at: null, last_seen_at: now }).in('id', failedIds)
    }
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
      trackStudyGaps: 0,
      weaknessCurriculumSignals: 0,
      retainedKnowledge: 0,
      liveSourceAdapters: readiness.liveAdapters,
      gapsConsidered: 0,
      documentsAcquired: 0,
      accepted: 0,
      probationary: 0,
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
      trackStudyGaps: 0,
      weaknessCurriculumSignals: 0,
      retainedKnowledge: 0,
      liveSourceAdapters: readiness.liveAdapters,
      gapsConsidered: 0,
      documentsAcquired: 0,
      accepted: 0,
      probationary: 0,
      rejected: {},
      sourceErrors: {},
      externalCostUsd: 0,
    }
  }

  const queued = input.gapSignals ? { ids: [], signals: input.gapSignals } : await loadQueuedReasoningGaps()
  const approvedUrls = input.approvedUrls ?? parseApprovedLearningUrls()
  const reasoningGaps = generateKnowledgeGaps(queued.signals)
  // What COS is measurably worst at on real work outranks what its corpus is merely thin about.
  const weaknessCurriculumSignals = await loadCosCurriculumSignals()
  const dynamic = await generateDynamicKnowledgeGaps(12, weaknessCurriculumSignals)
  const normalizedDynamicGaps = normalizeDynamicStudyGaps(dynamic.gaps)
  const reasoningKeys = new Set(reasoningGaps.map(gap => `${gap.subject.toLowerCase()}::${gap.question.toLowerCase()}`))
  const corpusExpansionGaps = normalizedDynamicGaps.filter(gap => !reasoningKeys.has(`${gap.subject.toLowerCase()}::${gap.question.toLowerCase()}`))
  const autonomousGaps = [...reasoningGaps, ...corpusExpansionGaps].slice(0, 12)
  // The declared curriculum tracks are studied too, not merely stored: a bounded, rotating slice of
  // track topics enters the same acquisition/admission cycle as every other gap, weakest tracks first.
  const trackStudy = curriculumTrackStudyGaps({
    prioritySubjects: weaknessCurriculumSignals.map(signal => signal.subject),
  })
  const curriculum = [...recurringTechnologyCurriculum(), ...roboticsPhysicsCurriculum(), ...trackStudy]
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
    weaknessCurriculumSignals: weaknessCurriculumSignals.length,
    weaknessCurriculumSubjects: weaknessCurriculumSignals.map(signal => signal.subject),
    retainedKnowledge: dynamic.retained,
    curriculumGaps: curriculum.length,
    trackStudyGaps: trackStudy.length,
    trackStudySubjects: trackStudy.map(gap => gap.subject),
    adapterKinds: adapters.map(a => a.id ?? a.kind),
  }))

  const director = new ContinuousLearningDirector(persistentStore, ZERO_LLM_POLICY)
  const cycle = new ContinuousLearningCycle(director, adapters)
  const result = await runLearningCycleWithTelemetry(() => cycle.run(gaps, 0), input.telemetry ?? consoleTelemetry)
  await markQueuedReasoningGaps(
    queued.ids.map((id, index) => ({ id, subject: queued.signals[index]?.subject ?? '' })),
    result.acceptedSubjects ?? [],
  )

  return {
    status: 'learned',
    approvedUrls: approvedUrls.length,
    autonomousGaps: autonomousGaps.length,
    curriculumGaps: curriculum.length,
    corpusExpansionGaps: corpusExpansionGaps.length,
    trackStudyGaps: trackStudy.length,
    weaknessCurriculumSignals: weaknessCurriculumSignals.length,
    retainedKnowledge: dynamic.retained,
    liveSourceAdapters: liveAdapters.length,
    ...result,
    externalCostUsd: 0,
  }
}
