// saas/app/api/admin/cos-turn-experience/route.ts
//
// Owner-only, read-only analysis of per-turn COS execution cost and skip decisions.
// This endpoint never recommends a routing change from latency alone. Outcome evidence must exist
// before a future policy can conclude that skipping an expensive phase is safe.

import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_LIMIT = 500

type PhaseRow = { phase?: string; kind?: string; ms?: number; ok?: boolean }
type SkipRow = { phase?: string; reason?: string }

type Row = {
  reasoner_label?: string | null
  surface_difficulty?: string | null
  phases?: PhaseRow[] | null
  skipped?: SkipRow[] | null
  total_ms?: number | null
  model_call_ms?: number | null
  other_ms?: number | null
  model_calls?: number | null
  answered?: boolean | null
  repair_needed?: boolean | null
  verified_success?: boolean | null
  outcome_at?: string | null
}

function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

function summarize(rows: Row[]) {
  const totals = rows.map(row => Number(row.total_ms)).filter(Number.isFinite) as number[]
  const modelCalls = rows.map(row => Number(row.model_calls)).filter(Number.isFinite) as number[]
  const withOutcome = rows.filter(row => row.outcome_at != null).length
  const verified = rows.filter(row => row.verified_success === true).length
  const repaired = rows.filter(row => row.repair_needed === true).length

  return {
    turns: rows.length,
    answered: rows.filter(row => row.answered === true).length,
    medianTurnMs: median(totals),
    slowestTurnMs: totals.length ? Math.max(...totals) : null,
    medianDirectModelCalls: median(modelCalls),
    outcomes: {
      turnsWithOutcome: withOutcome,
      turnsAwaitingOutcome: rows.length - withOutcome,
      verifiedSuccesses: verified,
      repairsNeeded: repaired,
    },
  }
}

export async function GET(request: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'COS service database is not configured.' }, { status: 503 })

  const requested = Number(request.nextUrl.searchParams.get('limit'))
  const limit = Number.isFinite(requested) && requested > 0 ? Math.min(2000, Math.floor(requested)) : DEFAULT_LIMIT

  const result = await db
    .from('cos_turn_experience')
    .select('turn_id,created_at,surface_difficulty,reasoner_label,phases,skipped,total_ms,model_call_ms,other_ms,model_calls,answered,repair_needed,verified_success,outcome_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (result.error) return NextResponse.json({ ok: false, error: result.error.message }, { status: 500 })

  const rows = (result.data ?? []) as Row[]
  if (!rows.length) {
    return NextResponse.json({
      ok: true,
      turns: 0,
      note: 'No per-turn execution rows have been recorded yet.',
    })
  }

  const phaseStats = new Map<string, { runs: number; failures: number; durations: number[] }>()
  const skipStats = new Map<string, Map<string, number>>()
  for (const row of rows) {
    for (const entry of (Array.isArray(row.phases) ? row.phases : [])) {
      const phase = String(entry.phase ?? 'unknown')
      const stats = phaseStats.get(phase) ?? { runs: 0, failures: 0, durations: [] }
      stats.runs += 1
      if (entry.ok === false) stats.failures += 1
      const ms = Number(entry.ms)
      if (Number.isFinite(ms)) stats.durations.push(ms)
      phaseStats.set(phase, stats)
    }
    for (const entry of (Array.isArray(row.skipped) ? row.skipped : [])) {
      const phase = String(entry.phase ?? 'unknown')
      const reason = String(entry.reason ?? 'unknown')
      const byReason = skipStats.get(phase) ?? new Map<string, number>()
      byReason.set(reason, (byReason.get(reason) ?? 0) + 1)
      skipStats.set(phase, byReason)
    }
  }

  const segments = new Map<string, Row[]>()
  for (const row of rows) {
    const key = `${row.reasoner_label || 'unknown'}|${row.surface_difficulty || 'unknown'}`
    const bucket = segments.get(key) ?? []
    bucket.push(row)
    segments.set(key, bucket)
  }

  return NextResponse.json({
    ok: true,
    ...summarize(rows),
    phases: [...phaseStats.entries()].map(([phase, stats]) => ({
      phase,
      runs: stats.runs,
      failures: stats.failures,
      medianMs: median(stats.durations),
      maxMs: stats.durations.length ? Math.max(...stats.durations) : null,
      totalMs: stats.durations.reduce((sum, value) => sum + value, 0),
    })).sort((a, b) => b.totalMs - a.totalMs),
    skips: [...skipStats.entries()].map(([phase, byReason]) => ({
      phase,
      total: [...byReason.values()].reduce((sum, value) => sum + value, 0),
      byReason: Object.fromEntries(byReason),
    })).sort((a, b) => b.total - a.total),
    segments: [...segments.entries()].map(([key, segmentRows]) => {
      const [reasonerLabel, surfaceDifficulty] = key.split('|')
      return { reasonerLabel, surfaceDifficulty, ...summarize(segmentRows) }
    }),
    interpretation: {
      modelCallAccounting: 'Direct model phases only. Council/challenge may contain additional provider calls, so model_calls/model_call_ms are lower bounds until provider-boundary correlation is added.',
      outcomeGate: rows.some(row => row.outcome_at != null)
        ? 'Outcomes exist. Compare like-for-like reasoner + difficulty cohorts before changing routing.'
        : 'Cost is measurable, but quality cost is not yet. Do not convert phase latency into an automatic skip rule.',
    },
  })
}
