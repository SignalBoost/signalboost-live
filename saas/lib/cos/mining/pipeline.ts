// saas/lib/cos/mining/pipeline.ts
// Modular ETL: Extract (load raw events) -> Transform (features, K-means, Apriori)
// -> Load (feature store, segments, rules). One audited run per invocation.

import { getMiningStore } from './storage'
import { extractFeatures } from './features'
import { kmeans, apriori } from './algorithms'
import { SegmentRecord, AssociationRule, MiningRunSummary } from './types'

export interface PipelineOptions {
  job: 'daily' | 'weekly' | 'manual'
  actor?: string
  /** Look-back window in days. Defaults: daily=2, weekly=30. */
  windowDays?: number
  /** Bound work per run so the cron stays within maxDuration. */
  maxEvents?: number
  /** Number of behavioral clusters. */
  k?: number
  minSupport?: number
  minConfidence?: number
}

export async function runMiningPipeline(
  opts: PipelineOptions,
): Promise<{ ok: boolean; summary?: MiningRunSummary; error?: string }> {
  const store = getMiningStore()
  const job = opts.job
  const actor = opts.actor || 'cron'
  const windowDays = opts.windowDays ?? (job === 'weekly' ? 30 : 2)
  const maxEvents = opts.maxEvents ?? 50_000
  const k = opts.k ?? 5

  const runId = await store.startRun(job, actor)

  try {
    // ── Extract ──
    const sinceISO = new Date(Date.now() - windowDays * 86_400_000).toISOString()
    const events = await store.loadEvents(sinceISO, maxEvents)

    // ── Transform ──
    const { features, vectors, userOrder, baskets } = extractFeatures(events)

    let segments: SegmentRecord[] = []
    if (vectors.length >= k && k > 0) {
      const km = kmeans(vectors, k, { seed: 42 })
      segments = userOrder.map((user_id, i) => ({
        user_id,
        segment: km.assignments[i],
        distance: km.distances[i],
      }))
    }

    let rules: AssociationRule[] = []
    if (baskets.length > 0) {
      rules = apriori(baskets, opts.minSupport ?? 0.05, opts.minConfidence ?? 0.5, 3)
    }

    // ── Load ──
    const featuresWritten = await store.writeFeatures(features, runId)
    const segmentsWritten = await store.writeSegments(segments, runId)
    const rulesFound = await store.writeRules(rules, runId)

    const summary: MiningRunSummary = {
      run_id: runId,
      job,
      events_scanned: events.length,
      users_processed: userOrder.length,
      features_written: featuresWritten,
      segments_written: segmentsWritten,
      rules_found: rulesFound,
    }

    await store.finishRun(runId, {
      status: 'success',
      events_scanned: events.length,
      users_processed: userOrder.length,
      features_written: featuresWritten,
      segments_written: segmentsWritten,
      rules_found: rulesFound,
    })

    return { ok: true, summary }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Mining pipeline error'
    await store.finishRun(runId, { status: 'error', error: message })
    return { ok: false, error: message }
  }
}
