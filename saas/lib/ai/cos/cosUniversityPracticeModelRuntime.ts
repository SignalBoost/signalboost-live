import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  UNIVERSITY_PRACTICE_MODEL_NOT_CONFIGURED,
  universityPracticeModelFromEnv,
} from './cosUniversityAgentModelPolicy.ts'

export const COS_UNIVERSITY_PRACTICE_MODEL_SETTING_KEY = 'cos_university_practice_model'
export const UNIVERSITY_PRACTICE_MODEL_INVALID = 'university_practice_model_invalid'

function configuredModel(value: unknown): string | null {
  const candidate = typeof value === 'string'
    ? value
    : value && typeof value === 'object' && !Array.isArray(value) && typeof (value as Record<string, unknown>).model === 'string'
      ? String((value as Record<string, unknown>).model)
      : ''
  const model = candidate.trim()
  if (!model) return null
  if (model.length > 180 || !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(model)) {
    throw new Error(UNIVERSITY_PRACTICE_MODEL_INVALID)
  }
  return model
}

/**
 * Resolve the non-credit University practice model without reintroducing a source-code default.
 *
 * Priority is deliberately narrow:
 * 1. an explicit UNIVERSITY_PRACTICE_MODEL environment value;
 * 2. when the managed runtime is DeepInfra and the environment value is absent, the service-only
 *    buyer-controlled system_settings row keyed by COS_UNIVERSITY_PRACTICE_MODEL_SETTING_KEY;
 * 3. self-hosted/non-DeepInfra runtimes may return null and keep their existing primary model.
 *
 * The database setting contains only a model identifier, never a credential. Missing or malformed
 * DeepInfra configuration still fails closed before inference and therefore before paid work.
 */
export async function resolveUniversityPracticeModel(options: {
  readSetting?: () => Promise<unknown>
} = {}): Promise<string | null> {
  try {
    return universityPracticeModelFromEnv()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message !== UNIVERSITY_PRACTICE_MODEL_NOT_CONFIGURED) throw error
  }

  const readSetting = options.readSetting || (async () => {
    const db = cosServiceDb()
    if (!db) throw new Error('service_database_unavailable')
    const result = await db.from('system_settings')
      .select('value')
      .eq('key', COS_UNIVERSITY_PRACTICE_MODEL_SETTING_KEY)
      .maybeSingle()
    if (result.error) throw result.error
    return result.data?.value ?? null
  })

  const model = configuredModel(await readSetting())
  if (!model) throw new Error(UNIVERSITY_PRACTICE_MODEL_NOT_CONFIGURED)
  return model
}
