import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { directedSoftwareApplicationProgress, specialistCompetencySnapshot, type SpecialistFamily } from './specialistLearning.ts'

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

export async function readDirectedSoftwareApplicationProgress() {
  const db = cosServiceDb()
  if (!db) return { ok: false as const, error: 'COS service database is not configured', progress: null }
  const pageSize = 1000
  const readLessons = async () => {
    const rows: Array<{ status?: string | null; repeat_count?: number | null; metadata?: Record<string, unknown> | null }> = []
    for (let offset = 0; ; offset += pageSize) {
      const page = await db.from('cos_teacher_lessons')
        .select('status,repeat_count,metadata')
        .contains('metadata', { origin: 'owner_directed_study', specialistFamily: 'software' })
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1)
      if (page.error) throw page.error
      rows.push(...(page.data ?? []))
      if ((page.data?.length ?? 0) < pageSize) return rows
    }
  }
  const readSkills = async () => {
    const rows: Array<{ status?: string | null; procedure?: Record<string, unknown> | null; metadata?: Record<string, unknown> | null; last_validated_at?: string | null; updated_at?: string | null }> = []
    for (let offset = 0; ; offset += pageSize) {
      const page = await db.from('cos_cognitive_skills')
        .select('status,procedure,metadata,last_validated_at,updated_at')
        .contains('metadata', { origin: 'owner_directed_study', specialistFamily: 'software' })
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1)
      if (page.error) throw page.error
      rows.push(...(page.data ?? []))
      if ((page.data?.length ?? 0) < pageSize) return rows
    }
  }
  try {
    const [lessons, skills] = await Promise.all([readLessons(), readSkills()])
    return { ok: true as const, progress: directedSoftwareApplicationProgress(lessons, skills) }
  } catch (error) {
    return { ok: false as const, error: String((error as { message?: string })?.message || error).slice(0, 300), progress: null }
  }
}
