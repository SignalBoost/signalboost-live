// saas/lib/ai/localInferenceUsage.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { currentTraceId } from '../observability/tracing.ts'

export type LocalInferenceUsageContext = Readonly<{
  feature: string
  correlationId?: string | null
  agentId?: string | null
  purpose?: string | null
}>

export type LocalInferenceUsageRecord = Readonly<{
  requestId: string
  provider: string
  model: string
  context: LocalInferenceUsageContext
  routeOwner?: 'itmounts' | 'external' | null
  graduateCandidateId?: string | null
  graduateArtifactId?: string | null
  graduateArtifactHash?: string | null
  fallbackFromOwned?: boolean
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
  cachedPromptTokens: number | null
  providerEstimatedCostUsd: number | null
  success: boolean
  httpStatus: number | null
  latencyMs: number
  finishReason: string | null
}>

let usageDb: SupabaseClient | null | undefined

function serviceDb(): SupabaseClient | null {
  if (usageDb !== undefined) return usageDb
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  usageDb = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null
  return usageDb
}

function clean(value: unknown, max = 240): string | null {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
  return text || null
}

/**
 * "The provider did not report this" and "the provider reported zero" are different facts and must stay
 * different in the stored row. Number(null), Number(undefined ?? '') and Number(false) all coerce to a
 * finite non-negative number, so coercing first silently manufactures a zero out of an absent value —
 * every caller of this module was affected, not only the distilled evaluator. Reject unreported inputs
 * before any numeric coercion; genuine zeros still store as 0.
 */
export function usageValueReported(value: unknown): boolean {
  return value !== null
    && value !== undefined
    && typeof value !== 'boolean'
    && !(typeof value === 'string' && value.trim() === '')
}

export function nonNegativeInt(value: unknown): number | null {
  if (!usageValueReported(value)) return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
}

export function nonNegativeNumber(value: unknown): number | null {
  if (!usageValueReported(value)) return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/**
 * Best-effort billing/routing telemetry only. A failed telemetry write must never change an inference
 * result, academic verdict, Builder result, or authorization decision. Prompts, responses, credentials
 * and hidden reasoning are never stored here.
 *
 * Compute provider and model ownership are deliberately separate facts. For example,
 * `provider=deepinfra, route_owner=itmounts` means iTMounts owns the selected graduate artifact but
 * temporarily rents DeepInfra compute to serve it.
 */
export async function recordLocalInferenceUsage(record: LocalInferenceUsageRecord): Promise<void> {
  const db = serviceDb()
  if (!db) return
  // Derive cost_source from the stored value, not from a strict === null test on the input: an
  // undefined or unparseable cost was previously labelled provider_reported while storing null.
  const providerEstimatedCostUsd = nonNegativeNumber(record.providerEstimatedCostUsd)
  const row = {
    request_id: clean(record.requestId, 120),
    provider: clean(record.provider, 80) || 'unknown',
    model: clean(record.model, 300) || 'unknown',
    feature: clean(record.context.feature, 120) || 'unattributed',
    // A caller's own correlation id wins; otherwise the platform trace id joins this call to its request, its errors
    // and its Builder job.
    correlation_id: clean(record.context.correlationId, 240) ?? currentTraceId(),
    agent_id: clean(record.context.agentId, 180),
    purpose: clean(record.context.purpose, 120),
    route_owner: record.routeOwner || null,
    graduate_candidate_id: clean(record.graduateCandidateId, 240),
    graduate_artifact_id: clean(record.graduateArtifactId, 500),
    graduate_artifact_hash: clean(record.graduateArtifactHash, 64),
    fallback_from_owned: record.fallbackFromOwned === true,
    prompt_tokens: nonNegativeInt(record.promptTokens),
    completion_tokens: nonNegativeInt(record.completionTokens),
    total_tokens: nonNegativeInt(record.totalTokens),
    cached_prompt_tokens: nonNegativeInt(record.cachedPromptTokens),
    provider_estimated_cost_usd: providerEstimatedCostUsd,
    cost_source: providerEstimatedCostUsd === null ? 'unreported' : 'provider_reported',
    success: Boolean(record.success),
    http_status: record.httpStatus,
    latency_ms: Math.max(0, Math.floor(record.latencyMs || 0)),
    finish_reason: clean(record.finishReason, 80),
  }
  const result = await db.from('provider_inference_usage').insert(row)
  if (result.error) throw result.error
}

/**
 * Builder RunPod health shared by every serverless instance. Production 2026-10-14 (OrderFlow job 4eb4a2e5): an
 * in-memory breaker lives in one instance, so each new instance probed a failing RunPod again — 80 of 98 Builder RunPod
 * calls timed out (17.5-52s each, no output) before the configured fallback answered in ~8s. The recorded usage rows are
 * the shared state: when the two most recent Builder RunPod calls in the last two minutes both timed out, skip RunPod
 * and use the fallback the timeout would reach anyway. With no new RunPod rows the window drains and RunPod is probed again.
 */
export const BUILDER_RUNPOD_HEALTH_WINDOW_MS = 120_000

/**
 * Protect long coding rounds from a healthy-but-too-slow owned endpoint.
 * Require two measured successful completions with >=32 tokens each;
 * a short response or missing usage is not enough evidence to reroute.
 */
export function builderRunpodRowsTooSlow(rows: ReadonlyArray<{
  success?: unknown; completion_tokens?: unknown; latency_ms?: unknown
}>): boolean {
  if (rows.length < 2) return false
  return rows.slice(0, 2).every(row => {
    const tokens = nonNegativeInt(row.completion_tokens)
    const elapsed = nonNegativeNumber(row.latency_ms)
    return row.success === true && tokens !== null && tokens >= 32
      && elapsed !== null && elapsed >= 1_000
      && tokens * 1_000 / elapsed < 10
  })
}

export function builderRunpodRowsTimedOut(rows: ReadonlyArray<{ success?: unknown; finish_reason?: unknown }>): boolean {
  return rows.length >= 2 && rows.slice(0, 2).every(row => row.success === false && String(row.finish_reason || '').startsWith('timeout:'))
}

export async function builderRunpodRecentlyTimingOut(nowMs = Date.now()): Promise<boolean> {
  const db = serviceDb()
  if (!db) return false
  const { data, error } = await db.from('provider_inference_usage').select('success,finish_reason,completion_tokens,latency_ms')
    .eq('feature', 'builder_runpod_primary')
    .gte('created_at', new Date(nowMs - BUILDER_RUNPOD_HEALTH_WINDOW_MS).toISOString())
    .order('created_at', { ascending: false }).limit(2)
  // An unreadable health record never blocks the owned model: probe it as before.
  if (error || !data) return false
  return builderRunpodRowsTimedOut(data) || builderRunpodRowsTooSlow(data)
}
