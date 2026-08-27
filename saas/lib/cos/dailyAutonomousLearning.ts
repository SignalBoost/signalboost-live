// saas/lib/cos/dailyAutonomousLearning.ts
import type { ContinuousLearningSourceAdapter } from '@/lib/cos-core/layers/learning/cycle'
import { ContinuousLearningCycle } from '@/lib/cos-core/layers/learning/cycle'
import { ContinuousLearningDirector, type ContinuousLearningStore, type KnowledgeGap } from '@/lib/cos-core/layers/learning'
import { createLiveLearningAdapters } from '@/lib/cos-core/layers/learning/liveSources'
import { createSupabaseCOSStores } from '@/lib/cos-core/storage/supabase'
import { generateKnowledgeGaps, type KnowledgeGapSignal } from '@/lib/cos-core/layers/learning/gaps'
import { generateDynamicKnowledgeGaps } from '@/lib/cos-core/layers/learning/dynamicGaps'
import { autopsyGaps } from '@/lib/ai/cos/learningGapAutopsy'
import { loadCosCurriculumSignals, curriculumTrackStudyGaps } from '@/lib/ai/cos/cosCurriculumPriority'
import { isOperationalSystemsGap } from '@/lib/ai/cos/operationalSystemsLearning'
import { FOUNDATIONAL_KNOWLEDGE_DOMAINS, nearestFoundationalSubject } from '@/lib/cos-core/layers/learning/foundational'
import { roboticsPhysicsCurriculum } from './roboticsPhysicsCurriculum.ts'
import type { MiningRunSummary } from './mining/types.ts'

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
    ['saas-business-strategy', 'business strategy enterprise SaaS economics operations', 'What durable principles govern enterprise SaaS pricing, unit economics, retention, procurement, security review, buyer control, ROI demonstration, and adoption — and what current evidence supports them?', 91],
    ['b2b-revenue-operations', 'B2B enterprise sales marketing revenue operations', 'What evidence-based practices improve B2B prospecting, qualification, outreach, positioning, campaign measurement, marketing attribution, lifecycle messaging, pipeline conversion, and retention?', 89],
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
  run: () => Promise<{ gapsConsidered: number; documentsAcquired: number; accepted: number; probationary: number; acceptedSubjects: string[]; rejected: Record<string, number>; sourceErrors: Record<string, number>; externalCostUsd: number }>,
  telemetry: ContinuousLearningTelemetrySink,
) {
  const startedAt = Date.now()
  const result = await run()
  await telemetry.record({ event: 'cos_continuous_learning_cycle', latencyMs: Date.now() - startedAt, ...result })
  return result
}

const STUDYABLE_GAP_SUBJECTS: ReadonlySet<string> = new Set(
  FOUNDATIONAL_KNOWLEDGE_DOMAINS.map(domain => domain.subject.toLowerCase()),
)

export function isStudyableGapSubject(subject: string): boolean {
  return STUDYABLE_GAP_SUBJECTS.has(String(subject ?? '').replace(/\s+/g, ' ').trim().toLowerCase())
}

export function normalizeQueuedGapSubject(subject: string, question: string): string | null {
  const stored = String(subject ?? '').replace(/\s+/g, ' ').trim()
  if (isStudyableGapSubject(stored)) return stored
  const text = `${String(question ?? '').trim()} ${stored}`.trim()
  const derived = text ? nearestFoundationalSubject(text) : null
  return derived && isStudyableGapSubject(derived) ? derived : null
}

/**
 * Dynamic gaps normally cross the same bounded-subject hygiene as queued gaps. The only exception
 * is the deterministic owner-directed operational curriculum: its ID and safety evidence are both
 * required, so arbitrary chat fragments cannot use this path to become acquisition queries.
 */
export function normalizeDynamicStudyGaps(gaps: KnowledgeGap[]): KnowledgeGap[] {
  const seen = new Set<string>()
  const normalized: KnowledgeGap[] = []
  for (const gap of gaps) {
    if (isOperationalSystemsGap(gap)) {
      const key = `${gap.subject.toLowerCase()}::${gap.question.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      normalized.push(gap)
      continue
    }

    const subject = normalizeQueuedGapSubject(gap.subject, gap.question)
    if (!subject) continue
    const key = `${subject.toLowerCase()}::${gap.question.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(subject === gap.subject ? gap : {
      ...gap,
      subject,
      question: `What current, verifiable evidence is relevant to ${subject}?`,
      evidence: [...(gap.evidence ?? []), `reanchored_from_subject=${String(gap.subject).slice(0, 180)}`],
    })
  }
  return normalized
}

export function queuedGapResolution(subject: string, acceptedSubjects: string[]): 'resolved' | 'failed' {
  const value = String(subject ?? '').trim().toLowerCase()
  return acceptedSubjects.some(accepted => String(accepted ?? '').trim().toLowerCase() === value) ? 'resolved' : 'failed'
}

async function loadQueuedReasoningGaps(): Promise<{ ids: string[]; signals: KnowledgeGapSignal[] }> {
  const db = createSupabaseCOSStores() ? (await import('@/lib/cos-core/storage/supabase')).cosServiceDb() : null
  if (!db) return { ids: [], signals: [] }
  try {
    const { data } = await db.from('cos_learning_gaps').select('*').in('status', ['pending', 'failed']).is('autopsy_at', null).order('last_seen_at', { ascending: false }).limit(25)
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
      await recordGapFailuresAndAutopsy(db, failedIds, now)
    }
  } catch {}
}

async function recordGapFailuresAndAutopsy(db: any, failedIds: string[], now: string): Promise<void> {
  try {
    const { data, error } = await db
      .from('cos_learning_gaps')
      .select('id,subject,question,capability,repeated_count,attempt_count,failure_attempts,escalation_reason')
      .in('id', failedIds)
    if (error || !Array.isArray(data)) return

    const findings = autopsyGaps(data.map((row: any) => ({
      id: String(row.id),
      subject: row.subject,
      question: row.question,
      capability: row.capability,
      repeatedCount: Number(row.repeated_count || 0),
      attemptCount: Number(row.attempt_count || 0) + 1,
      attempts: [
        ...(Array.isArray(row.failure_attempts) ? row.failure_attempts : []),
        { reason: String(row.escalation_reason || 'acquisition produced no accepted evidence'), at: now },
      ],
      escalationReason: row.escalation_reason,
    })))

    for (const row of data as any[]) {
      const finding = findings.retry.concat(findings.terminal).find(entry => entry.gapId === String(row.id))
      if (!finding) continue
      const attempts = [
        ...(Array.isArray(row.failure_attempts) ? row.failure_attempts : []),
        { reason: String(row.escalation_reason || 'acquisition produced no accepted evidence').slice(0, 200), at: now },
      ].slice(-12)

      const update: Record<string, unknown> = {
        attempt_count: Number(row.attempt_count || 0) + 1,
        failure_attempts: attempts,
        last_seen_at: now,
      }
      if (finding.terminal) {
        update.status = 'retired'
        update.autopsy_verdict = finding.verdict
        update.autopsy_rationale = finding.rationale.slice(0, 1000)
        update.autopsy_at = now
      }
      try { await db.from('cos_learning_gaps').update(update).eq('id', row.id) } catch {}
    }

    if (findings.terminal.length) {
      console.warn('[cos-learning-gap-autopsy]', JSON.stringify({
        at: now,
        retired: findings.terminal.length,
        byVerdict: findings.byVerdict,
        examples: findings.terminal.slice(0, 3).map(entry => ({ gapId: entry.gapId, verdict: entry.verdict, attempts: entry.attemptCount })),
      }))
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
  injectedGapSignals?: KnowledgeGapSignal[]
}): Promise<DailyLearningResult> {
  const readiness = autonomousLearningReadiness()
  if (!autonomousLearningIsExplicitlyEnabled()) {
    console.warn('[cos-daily-learning-skipped]', JSON.stringify(readiness))
    return {
      status: 'skipped', skipReason: 'autonomous_learning_disabled', approvedUrls: readiness.approvedUrls,
      autonomousGaps: 0, curriculumGaps: 0, corpusExpansionGaps: 0, trackStudyGaps: 0,
      weaknessCurriculumSignals: 0, retainedKnowledge: 0, liveSourceAdapters: readiness.liveAdapters,
      gapsConsidered: 0, documentsAcquired: 0, accepted: 0, probationary: 0,
      rejected: {}, sourceErrors: {}, externalCostUsd: 0,
    }
  }

  const persistentStore = input.store ?? createSupabaseCOSStores()?.continuousLearning
  if (!persistentStore) {
    console.warn('[cos-daily-learning-skipped]', JSON.stringify({ ...readiness, reason: 'persistent_store_unavailable' }))
    return {
      status: 'skipped', skipReason: 'persistent_store_unavailable', approvedUrls: readiness.approvedUrls,
      autonomousGaps: 0, curriculumGaps: 0, corpusExpansionGaps: 0, trackStudyGaps: 0,
      weaknessCurriculumSignals: 0, retainedKnowledge: 0, liveSourceAdapters: readiness.liveAdapters,
      gapsConsidered: 0, documentsAcquired: 0, accepted: 0, probationary: 0,
      rejected: {}, sourceErrors: {}, externalCostUsd: 0,
    }
  }

  const queued = input.gapSignals ? { ids: [], signals: input.gapSignals } : await loadQueuedReasoningGaps()
  const approvedUrls = input.approvedUrls ?? parseApprovedLearningUrls()
  const reasoningGaps = generateKnowledgeGaps(queued.signals)
  const weaknessCurriculumSignals = await loadCosCurriculumSignals()
  const injectedGapSignals = input.injectedGapSignals ?? []
  const dynamic = await generateDynamicKnowledgeGaps(12, [...weaknessCurriculumSignals, ...injectedGapSignals])
  const normalizedDynamicGaps = normalizeDynamicStudyGaps(dynamic.gaps)
  const reasoningKeys = new Set(reasoningGaps.map(gap => `${gap.subject.toLowerCase()}::${gap.question.toLowerCase()}`))
  const corpusExpansionGaps = normalizedDynamicGaps.filter(gap => !reasoningKeys.has(`${gap.subject.toLowerCase()}::${gap.question.toLowerCase()}`))
  const autonomousGaps = [...reasoningGaps, ...corpusExpansionGaps].slice(0, 12)
  const trackStudy = curriculumTrackStudyGaps({ prioritySubjects: weaknessCurriculumSignals.map(signal => signal.subject) })
  const curriculum = [...recurringTechnologyCurriculum(), ...roboticsPhysicsCurriculum(), ...trackStudy]
  const gaps = [miningGap(input.miningSummary), ...autonomousGaps, ...curriculum]
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
    injectedGapSignals: injectedGapSignals.length,
    injectedGapSubjects: injectedGapSignals.map(signal => signal.subject),
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
