import { after } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import type { CosReasoningWorkerRole } from '@/lib/ai/cos/cosReasoningControlPlane'

export type ReasoningWorkerMetricInput = {
  turnId: string
  problemClass: string
  workerRole: CosReasoningWorkerRole
  reasonerLabel: string
  latencyMs: number
  prompt: string
  systemPrompt?: string
  response: string
}

export type ReasoningWorkerMetric = {
  turnId: string
  problemClass: string
  workerRole: CosReasoningWorkerRole
  reasonerLabel: string
  latencyMs: number
  estimatedInputTokens: number
  estimatedOutputTokens: number
  estimatedCostUsd: number | null
  pricingConfigured: boolean
}

function clean(value: unknown, max = 240): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

/**
 * Provider-neutral deterministic token estimate. This is deliberately labelled estimated rather
 * than pretending it is provider billing usage. Exact provider token usage can replace it later
 * without changing the learning schema or policy contract.
 */
export function estimateTextTokens(value: unknown): number {
  const text = String(value ?? '')
  if (!text) return 0
  return Math.max(1, Math.ceil(text.length / 4))
}

function configuredPrice(name: 'LOCAL_AI_INPUT_COST_PER_MILLION' | 'LOCAL_AI_OUTPUT_COST_PER_MILLION'): number | null {
  const raw = process.env[name]?.trim()
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : null
}

export function estimateReasoningCostUsd(inputTokens: number, outputTokens: number): { costUsd: number | null; pricingConfigured: boolean } {
  const inputRate = configuredPrice('LOCAL_AI_INPUT_COST_PER_MILLION')
  const outputRate = configuredPrice('LOCAL_AI_OUTPUT_COST_PER_MILLION')
  if (inputRate === null || outputRate === null) return { costUsd: null, pricingConfigured: false }
  const costUsd = (Math.max(0, inputTokens) * inputRate + Math.max(0, outputTokens) * outputRate) / 1_000_000
  return { costUsd: Math.round(costUsd * 1_000_000_000) / 1_000_000_000, pricingConfigured: true }
}

export function buildReasoningWorkerMetric(input: ReasoningWorkerMetricInput): ReasoningWorkerMetric {
  const estimatedInputTokens = estimateTextTokens(`${input.systemPrompt ?? ''}\n${input.prompt}`)
  const estimatedOutputTokens = estimateTextTokens(input.response)
  const cost = estimateReasoningCostUsd(estimatedInputTokens, estimatedOutputTokens)
  return {
    turnId: clean(input.turnId, 80),
    problemClass: clean(input.problemClass || 'general reasoning'),
    workerRole: input.workerRole,
    reasonerLabel: clean(input.reasonerLabel, 500),
    latencyMs: Math.max(0, Math.round(Number(input.latencyMs) || 0)),
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedCostUsd: cost.costUsd,
    pricingConfigured: cost.pricingConfigured,
  }
}

async function persistReasoningWorkerMetric(metric: ReasoningWorkerMetric): Promise<void> {
  try {
    const db = cosServiceDb()
    if (!db || !metric.turnId || !metric.reasonerLabel) return
    const result = await db.from('cos_reasoning_worker_metrics').upsert({
      turn_id: metric.turnId,
      problem_class: metric.problemClass,
      worker_role: metric.workerRole,
      reasoner_label: metric.reasonerLabel,
      latency_ms: metric.latencyMs,
      estimated_input_tokens: metric.estimatedInputTokens,
      estimated_output_tokens: metric.estimatedOutputTokens,
      estimated_cost_usd: metric.estimatedCostUsd,
      pricing_configured: metric.pricingConfigured,
      recorded_at: new Date().toISOString(),
    }, { onConflict: 'turn_id' })
    if (result.error) throw result.error
  } catch (error) {
    console.warn('[cos-reasoning-worker-metrics] persistence failed (non-fatal):', error instanceof Error ? error.message : String(error))
  }
}

export function recordReasoningWorkerMetric(input: ReasoningWorkerMetricInput): void {
  const metric = buildReasoningWorkerMetric(input)
  try {
    after(() => persistReasoningWorkerMetric(metric))
  } catch {
    void persistReasoningWorkerMetric(metric)
  }
}
