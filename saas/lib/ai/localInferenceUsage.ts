import { cosServiceDb } from '../cos-core/storage/supabase.ts'

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

function clean(value: unknown, max = 240): string | null {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
  return text || null
}

function nonNegativeInt(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
}

function nonNegativeNumber(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/**
 * Best-effort billing telemetry only. A failed telemetry write must never change an inference result,
 * academic verdict, Builder result, or authorization decision.
 */
export async function recordLocalInferenceUsage(record: LocalInferenceUsageRecord): Promise<void> {
  const db = cosServiceDb()
  if (!db) return
  const row = {
    request_id: clean(record.requestId, 120),
    provider: clean(record.provider, 80) || 'unknown',
    model: clean(record.model, 300) || 'unknown',
    feature: clean(record.context.feature, 120) || 'unattributed',
    correlation_id: clean(record.context.correlationId, 240),
    agent_id: clean(record.context.agentId, 180),
    purpose: clean(record.context.purpose, 120),
    prompt_tokens: nonNegativeInt(record.promptTokens),
    completion_tokens: nonNegativeInt(record.completionTokens),
    total_tokens: nonNegativeInt(record.totalTokens),
    cached_prompt_tokens: nonNegativeInt(record.cachedPromptTokens),
    provider_estimated_cost_usd: nonNegativeNumber(record.providerEstimatedCostUsd),
    cost_source: record.providerEstimatedCostUsd === null ? 'unreported' : 'provider_reported',
    success: Boolean(record.success),
    http_status: record.httpStatus,
    latency_ms: Math.max(0, Math.floor(record.latencyMs || 0)),
    finish_reason: clean(record.finishReason, 80),
  }
  const result = await db.from('provider_inference_usage').insert(row)
  if (result.error) throw result.error
}
