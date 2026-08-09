import { createHash } from 'node:crypto'
import { callModel, type ModelCallArgs } from '@/lib/ai/modelRouter'
import { cosServiceDb } from '@/lib/cos-core/storage'

export type CosTextGatewayInput = ModelCallArgs & {
  taskId?: string
  cacheValidator?: (text: string) => boolean
}

type StoredText = { text?: string }
type GatewaySource = 'exact_cache' | 'in_flight' | 'reasoning'

function cacheIdentity(input: CosTextGatewayInput) {
  const stable = JSON.stringify({
    taskId: input.taskId ?? 'cos-text',
    prompt: input.prompt,
    systemPrompt: input.systemPrompt ?? '',
    maxTokens: input.maxTokens ?? 2048,
    modelPreference: input.modelPreference ?? null,
  })
  return createHash('sha256').update(stable).digest('hex')
}

function passesCacheValidation(input: CosTextGatewayInput, text: string): boolean {
  if (!input.cacheValidator) return true
  try {
    return input.cacheValidator(text)
  } catch {
    return false
  }
}

function baselineProviderCostUsd(): number {
  const value = Number(process.env.COS_BASELINE_TEXT_CALL_COST_USD || 0)
  return Number.isFinite(value) && value > 0 ? value : 0
}

async function recordGatewayROI(
  input: CosTextGatewayInput,
  source: GatewaySource,
  startedAt: number,
): Promise<void> {
  const db = cosServiceDb()
  if (!db) return

  const baselineCost = baselineProviderCostUsd()
  const promptCharacters = input.prompt.length + (input.systemPrompt?.length || 0)
  try {
    await db.from('cos_ai_roi_metrics').insert({
      task_id: input.taskId ?? 'cos-text',
      source,
      provider_calls: source === 'reasoning' ? 1 : 0,
      estimated_provider_cost_usd: source === 'reasoning' ? baselineCost : 0,
      estimated_cost_avoided_usd: source === 'reasoning' ? 0 : baselineCost,
      prompt_characters_before: promptCharacters,
      prompt_characters_after: promptCharacters,
      latency_ms: Math.max(0, Date.now() - startedAt),
    })
  } catch {
    // ROI telemetry must never fail user work or trigger another provider call.
  }
}

const inFlight = new Map<string, Promise<string | null>>()

/**
 * Compatibility gateway for legacy COS text generators.
 *
 * It gives existing Portables durable exact reuse and single-flight protection
 * immediately, while provider execution remains isolated behind modelRouter.
 * New capabilities should use cos-core directly.
 */
export async function callCosText(input: CosTextGatewayInput): Promise<string | null> {
  const startedAt = Date.now()
  const key = cacheIdentity(input)
  const existing = inFlight.get(key)
  if (existing) {
    const value = await existing
    await recordGatewayROI(input, 'in_flight', startedAt)
    return value
  }

  const execution = (async () => {
    const db = cosServiceDb()
    if (db) {
      try {
        const { data, error } = await db.from('cos_text_cache').select('response_data').eq('cache_key', key).maybeSingle()
        if (!error) {
          const stored = data?.response_data as StoredText | undefined
          if (stored?.text) {
            if (passesCacheValidation(input, stored.text)) {
              await recordGatewayROI(input, 'exact_cache', startedAt)
              return stored.text
            }
            await db.from('cos_text_cache').delete().eq('cache_key', key)
          }
        }
      } catch {
        // Cache is an optimization. Provider execution must remain available.
      }
    }

    const text = await callModel(input)
    if (text && db && passesCacheValidation(input, text)) {
      try {
        await db.from('cos_text_cache').upsert({
          cache_key: key,
          task_id: input.taskId ?? 'cos-text',
          response_data: { text },
          updated_at: new Date().toISOString(),
        })
      } catch {
        // Persistence failures never repeat or fail successful provider work.
      }
    }
    await recordGatewayROI(input, 'reasoning', startedAt)
    return text
  })()

  inFlight.set(key, execution)
  try {
    return await execution
  } finally {
    inFlight.delete(key)
  }
}
