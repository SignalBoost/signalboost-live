import { createHash } from 'node:crypto'
import { callProviderModelDetailed, type ModelCallArgs, type ModelProvider } from '@/lib/ai/providerRouter'
import { cosServiceDb } from '@/lib/cos-core/storage'

export type CosTextGatewayInput = ModelCallArgs & {
  taskId?: string
}

export type CosTextGatewayResult = {
  text: string
  provider: ModelProvider | null
  model: string | null
  requestedProvider: ModelProvider | null
  fallbackUsed: boolean
  source: 'provider' | 'cache'
}

type StoredText = {
  text?: string
  provider?: ModelProvider
  model?: string
  requestedProvider?: ModelProvider
  fallbackUsed?: boolean
}

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

const inFlight = new Map<string, Promise<CosTextGatewayResult | null>>()

/**
 * Compatibility gateway for SignalBoost text generation.
 *
 * Durable exact reuse is checked before compute, and same-process duplicate requests
 * share one in-flight promise. Raw provider execution is isolated behind providerRouter;
 * feature routes and Portables never need provider credentials or provider APIs.
 */
export async function callCosTextDetailed(input: CosTextGatewayInput): Promise<CosTextGatewayResult | null> {
  const key = cacheIdentity(input)
  const existing = inFlight.get(key)
  if (existing) return existing

  const execution = (async () => {
    const db = cosServiceDb()
    if (db) {
      try {
        const { data, error } = await db.from('cos_text_cache').select('response_data').eq('cache_key', key).maybeSingle()
        if (!error) {
          const stored = data?.response_data as StoredText | undefined
          if (stored?.text) {
            return {
              text: stored.text,
              provider: stored.provider ?? null,
              model: stored.model ?? null,
              requestedProvider: stored.requestedProvider ?? null,
              fallbackUsed: stored.fallbackUsed === true,
              source: 'cache' as const,
            }
          }
        }
      } catch {
        // Cache is an optimization. Governed compute remains available.
      }
    }

    const result = await callProviderModelDetailed(input)
    if (result && db) {
      try {
        await db.from('cos_text_cache').upsert({
          cache_key: key,
          task_id: input.taskId ?? 'cos-text',
          response_data: {
            text: result.text,
            provider: result.provider,
            model: result.model,
            requestedProvider: result.requestedProvider,
            fallbackUsed: result.fallbackUsed,
          },
          updated_at: new Date().toISOString(),
        })
      } catch {
        // Persistence failures never repeat or fail successful provider work.
      }
    }
    return result ? {
      text: result.text,
      provider: result.provider,
      model: result.model,
      requestedProvider: result.requestedProvider,
      fallbackUsed: result.fallbackUsed,
      source: 'provider' as const,
    } : null
  })()

  inFlight.set(key, execution)
  try {
    return await execution
  } finally {
    inFlight.delete(key)
  }
}

export async function callCosText(input: CosTextGatewayInput): Promise<string | null> {
  return (await callCosTextDetailed(input))?.text ?? null
}
