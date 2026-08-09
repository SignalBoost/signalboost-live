import { createHash } from 'node:crypto'
import { callModel, type ModelCallArgs } from '@/lib/ai/modelRouter'
import { cosServiceDb } from '@/lib/cos-core/storage'

export type CosTextGatewayInput = ModelCallArgs & {
  taskId?: string
}

type StoredText = { text?: string }

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

const inFlight = new Map<string, Promise<string | null>>()

/**
 * Compatibility gateway for legacy COS text generators.
 *
 * It gives existing Portables durable exact reuse and single-flight protection
 * immediately, while provider execution remains isolated behind modelRouter.
 * New capabilities should use cos-core directly.
 */
export async function callCosText(input: CosTextGatewayInput): Promise<string | null> {
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
          if (stored?.text) return stored.text
        }
      } catch {
        // Cache is an optimization. Provider execution must remain available.
      }
    }

    const text = await callModel(input)
    if (text && db) {
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
    return text
  })()

  inFlight.set(key, execution)
  try {
    return await execution
  } finally {
    inFlight.delete(key)
  }
}
