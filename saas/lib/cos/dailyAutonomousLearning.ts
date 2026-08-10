import { ApprovedLearningSourceAdapter, staticLearningSourceAdapter } from '@/lib/cos-core/layers/learning/adapters'
import { ContinuousLearningCycle, type ContinuousLearningSourceAdapter, type LearningCycleResult } from '@/lib/cos-core/layers/learning/cycle'
import {
  ContinuousLearningDirector,
  type ContinuousLearningPolicy,
  type ContinuousLearningStore,
  type KnowledgeGap,
} from '@/lib/cos-core/layers/learning'
import { runLearningCycleWithTelemetry, type ContinuousLearningMetric, type ContinuousLearningTelemetrySink } from '@/lib/cos-core/layers/learning/telemetry'
import { createSupabaseCOSStores } from '@/lib/cos-core/storage/supabase'
import type { MiningRunSummary } from '@/lib/cos/mining/types'

const ZERO_LLM_POLICY: ContinuousLearningPolicy = {
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
  ]),
  minimumConfidence: 0.72,
  maxCandidatesPerCycle: 50,
  maxExternalCostUsdPerCycle: 0,
}

export type DailyLearningResult = LearningCycleResult & {
  status: 'learned' | 'skipped'
  approvedUrls: number
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

function cleanText(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20_000)
}

export function parseApprovedLearningUrls(raw = process.env.COS_DAILY_LEARNING_URLS || ''): string[] {
  return Array.from(new Set(raw.split(/[\n,]/).map((value) => value.trim()).filter(Boolean)))
    .filter((value) => {
      try { return new URL(value).protocol === 'https:' } catch { return false }
    })
    .slice(0, 10)
}

export function approvedUrlLearningAdapter(urls: string[], fetcher: FetchLike = fetch): ContinuousLearningSourceAdapter {
  return new ApprovedLearningSourceAdapter('approved_public_web', async (gap) => {
    const documents = []
    for (const url of urls.slice(0, 10)) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 8_000)
      try {
        const response = await fetcher(url, {
          headers: { accept: 'text/html,application/json,text/plain;q=0.9,*/*;q=0.5' },
          signal: controller.signal,
        })
        if (!response.ok) continue
        const text = cleanText(await response.text())
        if (!text) continue
        documents.push({
          sourceKind: 'approved_public_web' as const,
          sourceUri: url,
          sourceTitle: new URL(url).hostname,
          observedAt: new Date().toISOString(),
          subject: gap.subject,
          text,
          license: 'approved-source',
          evidence: [`Daily approved-source fetch: ${url}`],
        })
      } catch {
        // One unavailable school source must not fail the daily learning cycle.
      } finally {
        clearTimeout(timer)
      }
    }
    return documents
  })
}

function miningGap(summary: MiningRunSummary): KnowledgeGap {
  return {
    id: `daily-mining-${summary.run_id}`,
    subject: 'SignalBoost operating patterns',
    question: 'What reusable operating patterns were observed in the latest COS mining run?',
    portableIds: [],
    expectedReuse: Math.max(1, summary.users_processed),
    expectedAvoidedCostUsd: 0.05,
    urgency: 60,
    evidence: [`Mining run ${summary.run_id} scanned ${summary.events_scanned} events.`],
  }
}

function miningAdapter(summary: MiningRunSummary): ContinuousLearningSourceAdapter {
  return staticLearningSourceAdapter('work_experience', [{
    sourceKind: 'work_experience',
    sourceUri: `signalboost://cos-mining/${summary.run_id}`,
    sourceTitle: 'COS daily mining summary',
    observedAt: new Date().toISOString(),
    subject: 'SignalBoost operating patterns',
    text: [
      `Daily mining scanned ${summary.events_scanned} events and processed ${summary.users_processed} users.`,
      `${summary.features_written} reusable features were written, ${summary.segments_written} segments were written, and ${summary.rules_found} association rules were found.`,
    ].join(' '),
    license: 'internal',
    evidence: [`COS mining run ${summary.run_id}`],
  }])
}

const consoleTelemetry: ContinuousLearningTelemetrySink = {
  async record(metric: ContinuousLearningMetric) {
    console.info('[cos-daily-learning]', JSON.stringify(metric))
  },
}

export async function runDailyAutonomousLearning(input: {
  miningSummary: MiningRunSummary
  store?: ContinuousLearningStore
  adapters?: ContinuousLearningSourceAdapter[]
  telemetry?: ContinuousLearningTelemetrySink
  approvedUrls?: string[]
}): Promise<DailyLearningResult> {
  const persistentStore = input.store ?? createSupabaseCOSStores()?.continuousLearning
  if (!persistentStore) {
    return {
      status: 'skipped',
      approvedUrls: 0,
      gapsConsidered: 0,
      documentsAcquired: 0,
      accepted: 0,
      rejected: {},
      externalCostUsd: 0,
    }
  }

  const approvedUrls = input.approvedUrls ?? parseApprovedLearningUrls()
  const adapters = [
    miningAdapter(input.miningSummary),
    ...(approvedUrls.length ? [approvedUrlLearningAdapter(approvedUrls)] : []),
    ...(input.adapters ?? []),
  ]
  const director = new ContinuousLearningDirector(persistentStore, ZERO_LLM_POLICY)
  const cycle = new ContinuousLearningCycle(director, adapters)
  const result = await runLearningCycleWithTelemetry(
    () => cycle.run([miningGap(input.miningSummary)], 0),
    input.telemetry ?? consoleTelemetry,
  )

  return { status: 'learned', approvedUrls: approvedUrls.length, ...result, externalCostUsd: 0 }
}
