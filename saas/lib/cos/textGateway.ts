import { createHash } from 'node:crypto'
import { callModel, type ModelCallArgs } from '@/lib/ai/modelRouter'
import { cosServiceDb } from '@/lib/cos-core/storage'

export type CosTextGatewayInput = ModelCallArgs & {
  taskId?: string
  cacheValidator?: (text: string) => boolean
}

type StoredText = {
  text?: string
  prompt?: string
  systemPrompt?: string
  maxTokens?: number
  modelPreference?: string | null
}
type GatewaySource = 'exact_cache' | 'semantic_cache' | 'in_flight' | 'reasoning'

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

function normalizedTokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_-]+/gu, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean),
  )
}

function nearDuplicateScore(left: string, right: string): number {
  if (left === right) return 1
  if (left.length < 40 || right.length < 40) return 0
  const a = normalizedTokens(left)
  const b = normalizedTokens(right)
  if (!a.size || !b.size) return 0
  let intersection = 0
  for (const token of a) if (b.has(token)) intersection += 1
  return intersection / (a.size + b.size - intersection)
}

function sameExecutionShape(input: CosTextGatewayInput, stored: StoredText): boolean {
  return (stored.systemPrompt ?? '') === (input.systemPrompt ?? '')
    && (stored.maxTokens ?? 2048) === (input.maxTokens ?? 2048)
    && (stored.modelPreference ?? null) === (input.modelPreference ?? null)
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
 * Reuse order:
 * 1. durable exact cache
 * 2. conservative near-duplicate cache for the same task/execution shape
 * 3. in-flight single-flight protection
 * 4. provider execution
 *
 * Near-duplicate reuse is intentionally strict (>= 0.985 token Jaccard) so COS
 * avoids repeat spend for trivial wording/formatting changes without treating
 * materially different requests as equivalent. Structured callers still gate
 * every reused answer through their cacheValidator before it can be returned.
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

      try {
        const { data, error } = await db
          .from('cos_text_cache')
          .select('response_data')
          .eq('task_id', input.taskId ?? 'cos-text')
          .order('updated_at', { ascending: false })
          .limit(40)
        if (!error) {
          let best: { text: string; score: number } | null = null
          for (const row of data ?? []) {
            const stored = row?.response_data as StoredText | undefined
            if (!stored?.text || !stored.prompt || !sameExecutionShape(input, stored)) continue
            if (!passesCacheValidation(input, stored.text)) continue
            const score = nearDuplicateScore(input.prompt, stored.prompt)
            if (score >= 0.985 && (!best || score > best.score)) best = { text: stored.text, score }
          }
          if (best) {
            await recordGatewayROI(input, 'semantic_cache', startedAt)
            return best.text
          }
        }
      } catch {
        // Near-duplicate reuse is optional; fall through to provider execution.
      }
    }

    const text = await callModel(input)
    if (text && db && passesCacheValidation(input, text)) {
      try {
        await db.from('cos_text_cache').upsert({
          cache_key: key,
          task_id: input.taskId ?? 'cos-text',
          response_data: {
            text,
            prompt: input.prompt,
            systemPrompt: input.systemPrompt ?? '',
            maxTokens: input.maxTokens ?? 2048,
            modelPreference: input.modelPreference ?? null,
          },
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
