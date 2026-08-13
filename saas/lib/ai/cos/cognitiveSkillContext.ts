import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { rankContextCandidates } from '@/lib/ai/cos/contextRelevance'

export type CognitiveSkillContextItem = {
  id: string
  skillKey: string
  status: 'validated' | 'learned' | 'mastered'
  line: string
  similarity: number
}

export type CognitiveSkillContextResult = {
  retrieved: number
  relevant: number
  selected: number
  items: CognitiveSkillContextItem[]
}

function safe(value: unknown, max = 1800): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function threshold(): number {
  const raw = Number(process.env.COS_COGNITIVE_SKILL_SIMILARITY_THRESHOLD || '0.55')
  return Number.isFinite(raw) ? Math.max(0.3, Math.min(0.95, raw)) : 0.55
}

/**
 * Procedural memory is deliberately stricter than teacher memory. Captured/evaluated/understood/
 * practiced skills never enter a live answer. Only held-out validated (or stronger) skills are
 * eligible, and semantic relevance must still match the current question.
 *
 * A selected skill is guidance about HOW to reason; it is not factual corroboration and must never
 * increase the factual grounding ceiling or live answer confidence by itself.
 */
export async function retrieveValidatedCognitiveSkills(prompt: string): Promise<CognitiveSkillContextResult> {
  const db = cosServiceDb()
  if (!db) return { retrieved: 0, relevant: 0, selected: 0, items: [] }

  const result = await db
    .from('cos_cognitive_skills')
    .select('id,skill_key,subject,title,description,procedure,status,last_validated_at,updated_at')
    .in('status', ['validated', 'learned', 'mastered'])
    .order('last_validated_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(24)

  if (result.error) {
    console.warn('[cos-cognitive-skill-context] retrieval failed', result.error)
    return { retrieved: 0, relevant: 0, selected: 0, items: [] }
  }

  const rows = result.data ?? []
  const candidates = rows.map(row => ({
    item: row,
    text: [
      safe(row.subject, 300),
      safe(row.title, 300),
      safe(row.description, 1000),
      safe(JSON.stringify(row.procedure ?? {}), 4000),
    ].filter(Boolean).join(' '),
  }))
  const ranked = await rankContextCandidates(prompt, candidates, { threshold: threshold(), limit: 4 })
  const selected = ranked.relevant.slice(0, 4)

  return {
    retrieved: rows.length,
    relevant: ranked.relevant.length,
    selected: selected.length,
    items: selected.map((candidate, index) => {
      const row = candidate.item
      const status = String(row.status) as CognitiveSkillContextItem['status']
      return {
        id: String(row.id),
        skillKey: safe(row.skill_key, 240),
        status,
        similarity: candidate.similarity,
        line: `[SK${index + 1}] ${safe(row.title, 240)} — ${safe(row.description, 900)} Procedure: ${safe(JSON.stringify(row.procedure ?? {}), 3000)} [status ${status}; relevance ${candidate.similarity.toFixed(2)}; procedural guidance only, not factual evidence]`,
      }
    }),
  }
}

export async function recordCitedCognitiveSkillReuse(skillIds: string[]): Promise<void> {
  const ids = [...new Set(skillIds.filter(Boolean))]
  if (!ids.length) return
  const db = cosServiceDb()
  if (!db) return
  for (const id of ids) {
    try {
      const current = await db.from('cos_cognitive_skills').select('reuse_count').eq('id', id).maybeSingle()
      if (current.error) continue
      await db.from('cos_cognitive_skills').update({
        reuse_count: Number(current.data?.reuse_count || 0) + 1,
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', id)
    } catch {
      // Usage accounting must never break an answer.
    }
  }
}
