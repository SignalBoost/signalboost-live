import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  computeCosIndependenceMetrics,
  type CosIndependenceExperienceRow,
  type CosIndependenceMetrics,
} from '@/lib/ai/cos/cognitiveIndependenceMetrics'

const DEFAULT_WINDOW_DAYS = 30
const MAX_WINDOW_DAYS = 180
const DEFAULT_ROW_LIMIT = 2000
const MAX_ROW_LIMIT = 5000

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(min, Math.min(max, Math.floor(number)))
}

export type CosIndependenceReport = {
  generatedAt: string
  windowDays: number
  since: string
  rowsRead: number
  truncated: boolean
  metrics: CosIndependenceMetrics
  caveats: string[]
}

/**
 * Read only bounded episodic evidence for the runtime independence trend report.
 * This is deliberately service-side/admin-only telemetry, not a model prompt and not a mutation.
 */
export async function getCosIndependenceReport(options: {
  windowDays?: number
  rowLimit?: number
} = {}): Promise<CosIndependenceReport> {
  const windowDays = boundedInteger(options.windowDays, DEFAULT_WINDOW_DAYS, 1, MAX_WINDOW_DAYS)
  const rowLimit = boundedInteger(options.rowLimit, DEFAULT_ROW_LIMIT, 100, MAX_ROW_LIMIT)
  const generatedAt = new Date().toISOString()
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString()
  const db = cosServiceDb()
  if (!db) {
    return {
      generatedAt,
      windowDays,
      since,
      rowsRead: 0,
      truncated: false,
      metrics: computeCosIndependenceMetrics([]),
      caveats: [
        'COS service database is unavailable; no runtime independence evidence was read.',
        'Runtime independence metrics are observational telemetry, not held-out capability certification.',
      ],
    }
  }

  const result = await db
    .from('cos_cognitive_experiences')
    .select('experience_kind,subject,source_kind,success,occurrence_count,evidence,last_observed_at')
    .gte('last_observed_at', since)
    .in('experience_kind', ['encounter', 'teacher', 'feedback'])
    .order('last_observed_at', { ascending: false })
    .limit(rowLimit)

  if (result.error) throw result.error
  const rows = (result.data ?? []) as Array<CosIndependenceExperienceRow & { last_observed_at?: string | null }>
  return {
    generatedAt,
    windowDays,
    since,
    rowsRead: rows.length,
    truncated: rows.length >= rowLimit,
    metrics: computeCosIndependenceMetrics(rows),
    caveats: [
      'Operational independence measures completion without external AI reasoning; cache reuse and fresh-data verification are reported separately from new local reasoning.',
      'Explicit user feedback is an unverified quality/curriculum signal. It does not retroactively convert runtime acceptance into factual truth or a verified business outcome.',
      'COS gate acceptance is not the same as a verified business or production outcome.',
      'The ~85% independence target must be certified on a separate held-out SignalBoost workload; this report cannot certify it.',
    ],
  }
}
