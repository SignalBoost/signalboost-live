import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { specialistCompetencySnapshot, type SpecialistFamily } from './specialistLearning.ts'

export async function readSpecialistCompetency(family: SpecialistFamily) {
  const db = cosServiceDb()
  if (!db) return { ok: false as const, error: 'COS service database is not configured', snapshot: null }
  const result = await db.from('cos_cognitive_skills')
    .select('status,procedure,metadata,last_validated_at,updated_at')
    .or(`metadata->>specialistFamily.eq.${family},procedure->>specialistFamily.eq.${family}`)
    .limit(1000)
  if (result.error) return { ok: false as const, error: String(result.error.message || result.error).slice(0, 300), snapshot: null }
  return { ok: true as const, snapshot: specialistCompetencySnapshot(family, result.data ?? []) }
}
