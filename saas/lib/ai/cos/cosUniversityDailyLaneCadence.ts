import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import type { LearningPathId } from './cosUniversityLearningAssurance.ts'
import {
  decideCosUniversityDailyLaneCadence,
  type CosUniversityDailyLaneCadence,
  type CosUniversityDailyLaneReceiptRow,
} from './cosUniversityDailyLaneCadenceCore.ts'

/**
 * Reads today's receipts for one daily lane from the append-only ledger and decides if its batch is due.
 * Pass agentId for a per-agent lane so each registered agent gets its own once-per-UTC-day batch.
 */
export async function readCosUniversityDailyLaneCadence(path: LearningPathId, now = new Date(), agentId?: string): Promise<CosUniversityDailyLaneCadence> {
  const db = cosServiceDb()
  // Without the ledger the runner itself will surface service_database_unavailable; never skip silently.
  if (!db) return decideCosUniversityDailyLaneCadence({ path, now, rows: [], agentId })
  const dayStart = `${now.toISOString().slice(0, 10)}T00:00:00.000Z`
  const result = await db.from('cos_university_learning_assurance_events')
    .select('event_key,observed_at,evidence')
    .eq('event_type', 'production_path')
    .eq('path_id', path)
    .gte('observed_at', dayStart)
    .order('observed_at', { ascending: false })
    .limit(200)
  if (result.error) throw result.error
  return decideCosUniversityDailyLaneCadence({ path, now, rows: (result.data || []) as CosUniversityDailyLaneReceiptRow[], agentId })
}
