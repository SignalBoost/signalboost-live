// saas/lib/ai/usage.ts
//
// AI usage metering + prompt-cache helpers. Two jobs:
//   1. cachedSystem() — wrap a static system prompt as an Anthropic content
//      block marked cache_control: ephemeral, so the stable prefix is cached and
//      consecutive calls pay the (much cheaper) cache-read rate on it.
//   2. recordUsage() — write the token counts + an estimated USD cost to the
//      user_audit_usage ledger, so external-user consumption can be attributed,
//      billed, or throttled. Resilient: never throws into the request path.
//
// Token counts are the billing source of truth. cost_usd is a convenience
// estimate from RATES below — VERIFY these against current provider pricing
// before using them for actual invoicing; override per-model via env if needed.

import { createClient } from '@supabase/supabase-js'

export interface TokenUsage {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

export type SystemBlock = { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }

/**
 * Mark a static system prompt as ephemeral-cacheable. Anthropic only actually
 * caches blocks above its minimum size (~1024 tokens for Sonnet); below that
 * this is a harmless no-op that costs nothing and changes no behavior.
 */
export function cachedSystem(staticText: string): SystemBlock[] {
  return [{ type: 'text', text: staticText, cache_control: { type: 'ephemeral' } }]
}

// USD per 1M tokens. Placeholder rates — confirm against current pricing.
type Rate = { in: number; out: number; cacheWrite: number; cacheRead: number }
const RATES: Record<string, Rate> = {
  'claude-sonnet-4-6': { in: 3, out: 15, cacheWrite: 3.75, cacheRead: 0.30 },
  'claude-haiku-4-5':  { in: 1, out: 5, cacheWrite: 1.25, cacheRead: 0.10 },
}
const DEFAULT_RATE: Rate = { in: 3, out: 15, cacheWrite: 3.75, cacheRead: 0.30 }

export function estimateCostUsd(model: string, usage: TokenUsage): number {
  const r = RATES[model] || DEFAULT_RATE
  const M = 1_000_000
  const cost =
    (usage.input_tokens || 0) * r.in / M +
    (usage.output_tokens || 0) * r.out / M +
    (usage.cache_creation_input_tokens || 0) * r.cacheWrite / M +
    (usage.cache_read_input_tokens || 0) * r.cacheRead / M
  return Math.round(cost * 1e6) / 1e6
}

let _db: any = null
function serviceDb(): any {
  if (_db) return _db
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  _db = createClient(url, key, { auth: { persistSession: false } })
  return _db
}

export interface RecordUsageInput {
  userId?: string | null
  feature: string
  model: string
  usage: TokenUsage | null | undefined
}

/** Write one usage row. Best-effort: logs and returns on any failure. */
export async function recordUsage(input: RecordUsageInput): Promise<void> {
  try {
    const db = serviceDb()
    if (!db) return
    const u = input.usage || {}
    await db.from('user_audit_usage').insert({
      user_id: input.userId ?? null,
      feature: input.feature,
      model: input.model,
      input_tokens: u.input_tokens ?? 0,
      output_tokens: u.output_tokens ?? 0,
      cache_creation_tokens: u.cache_creation_input_tokens ?? 0,
      cache_read_tokens: u.cache_read_input_tokens ?? 0,
      cost_usd: estimateCostUsd(input.model, u),
    })
  } catch (err) {
    console.error('[ai/usage] recordUsage failed:', err)
  }
}
