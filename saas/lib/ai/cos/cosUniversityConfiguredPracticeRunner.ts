import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { universityPracticeModelFromConfiguration } from './cosUniversityAgentModelPolicy.ts'
import { runCosUniversityDeliberatePractice } from './cosUniversityDeliberatePracticeRunner.ts'
import { runWithUniversityPracticeModel } from './cosUniversityPracticeModelContext.ts'

export const COS_UNIVERSITY_PRACTICE_MODEL_SETTING_KEY = 'cos_university_practice_model'

type DeliberatePracticeOptions = Parameters<typeof runCosUniversityDeliberatePractice>[0]

async function readBuyerControlledPracticeModelSetting(): Promise<unknown> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('system_settings')
    .select('value')
    .eq('key', COS_UNIVERSITY_PRACTICE_MODEL_SETTING_KEY)
    .maybeSingle()
  if (result.error) throw result.error
  return result.data?.value ?? null
}

/**
 * Production host wrapper. It reads only the model identifier from service-only configuration,
 * lets environment configuration remain authoritative, and scopes the resolved value to this one
 * non-credit practice batch. No credential, grade, or authority travels through this context.
 */
export async function runConfiguredCosUniversityDeliberatePractice(
  options: DeliberatePracticeOptions = {},
) {
  const setting = await readBuyerControlledPracticeModelSetting()
  const model = universityPracticeModelFromConfiguration(setting)
  return runWithUniversityPracticeModel(model, () => runCosUniversityDeliberatePractice(options))
}
