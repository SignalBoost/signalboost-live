// saas/lib/ai/localInferenceUsage.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

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
    correlation_id: clean(record.context.correlationId, 240),
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
