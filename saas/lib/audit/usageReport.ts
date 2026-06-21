// saas/lib/audit/usageReport.ts
//
// PURE aggregator for the user_audit_usage ledger. Rows in, dashboard summary
// out — no I/O, no React. The route fetches the rows; this shapes them into
// totals, per-feature breakdown, top consumers, and a cache-efficiency figure.

export interface UsageRow {
  user_id: string | null
  feature: string
  model: string
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
  cost_usd: number
  created_at: string
}

export interface UsageTotals {
  calls: number
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  costUsd: number
}

export interface UsageGroup {
  key: string
  calls: number
  tokens: number
  costUsd: number
}

export interface UsageReportData {
  windowDays: number
  totals: UsageTotals
  cacheReadPct: number // cache_read / (input + cache_read) — how much input was served from cache
  byFeature: UsageGroup[]
  byUser: UsageGroup[] // top consumers, highest cost first
}

function num(v: any): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

function rowTokens(r: UsageRow): number {
  return num(r.input_tokens) + num(r.output_tokens) + num(r.cache_creation_tokens) + num(r.cache_read_tokens)
}

export function aggregateUsage(rows: UsageRow[], windowDays: number): UsageReportData {
  const totals: UsageTotals = { calls: 0, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, costUsd: 0 }
  const feat = new Map<string, UsageGroup>()
  const user = new Map<string, UsageGroup>()

  for (const r of rows) {
    totals.calls += 1
    totals.inputTokens += num(r.input_tokens)
    totals.outputTokens += num(r.output_tokens)
    totals.cacheCreationTokens += num(r.cache_creation_tokens)
    totals.cacheReadTokens += num(r.cache_read_tokens)
    totals.costUsd += num(r.cost_usd)

    const fk = r.feature || 'unknown'
    const fg = feat.get(fk) || { key: fk, calls: 0, tokens: 0, costUsd: 0 }
    fg.calls += 1; fg.tokens += rowTokens(r); fg.costUsd += num(r.cost_usd)
    feat.set(fk, fg)

    const uk = r.user_id || 'anonymous'
    const ug = user.get(uk) || { key: uk, calls: 0, tokens: 0, costUsd: 0 }
    ug.calls += 1; ug.tokens += rowTokens(r); ug.costUsd += num(r.cost_usd)
    user.set(uk, ug)
  }

  totals.costUsd = Math.round(totals.costUsd * 1e6) / 1e6
  const cacheBase = totals.inputTokens + totals.cacheReadTokens
  const cacheReadPct = cacheBase > 0 ? Math.round((totals.cacheReadTokens / cacheBase) * 1000) / 10 : 0

  const byFeature = [...feat.values()].sort((a, b) => b.costUsd - a.costUsd)
  const byUser = [...user.values()].sort((a, b) => b.costUsd - a.costUsd).slice(0, 15)

  return { windowDays, totals, cacheReadPct, byFeature, byUser }
}
