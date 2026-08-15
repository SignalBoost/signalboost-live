import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { rankContextCandidates } from '@/lib/ai/cos/contextRelevance'
import { assessSkillSelection } from '@/lib/ai/cos/cognitiveMetacognition'

export type CognitiveSkillContextItem = {
  id: string
  skillKey: string
  status: 'validated' | 'learned' | 'mastered'
  line: string
  similarity: number
  selectionScore: number
  evidenceReliability: number
}

export type CognitiveSkillContextResult = {
  retrieved: number
  relevant: number
  selected: number
  dependencyRejected: number
  items: CognitiveSkillContextItem[]
}

function safe(value: unknown, max = 1800): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function threshold(): number {
  const raw = Number(process.env.COS_COGNITIVE_SKILL_SIMILARITY_THRESHOLD || '0.55')
  return Number.isFinite(raw) ? Math.max(0.3, Math.min(0.95, raw)) : 0.55
}

function leafDependencies(row: any): string[] {
  const provenance = row?.provenance && typeof row.provenance === 'object' ? row.provenance : {}
  const rawLeaves: unknown[] = Array.isArray(provenance.leaf_member_skill_keys) ? provenance.leaf_member_skill_keys : []
  return [...new Set<string>(rawLeaves.map(item => safe(item, 240)).filter((item): item is string => Boolean(item)))]
}

async function dependencyHealth(rows: any[]): Promise<Map<string, boolean>> {
  const allLeaves = [...new Set<string>(rows.flatMap(leafDependencies))]
  const health = new Map<string, boolean>()
  if (!allLeaves.length) return health
  const db = cosServiceDb()
  if (!db) return health
  const result = await db.from('cos_cognitive_skills').select('skill_key,status').in('skill_key', allLeaves)
  if (result.error) {
    console.warn('[cos-cognitive-skill-context] dependency retrieval failed', result.error)
    for (const row of rows) if (leafDependencies(row).length) health.set(String(row.skill_key), false)
    return health
  }
  const statuses = new Map((result.data ?? []).map((row: any) => [String(row.skill_key), String(row.status)]))
  for (const row of rows) {
    const leaves = leafDependencies(row)
    if (!leaves.length) continue
    health.set(String(row.skill_key), leaves.every(key => ['validated', 'learned', 'mastered'].includes(statuses.get(key) || '')))
  }
  return health
}

/**
 * Live procedural retrieval is evidence-aware, not similarity-only. Captured/evaluated/understood/
 * practiced skills never enter a live answer. Composite skills also fail closed if any flattened leaf
 * dependency has weakened, been quarantined, or otherwise stopped being strong.
 *
 * Historical production/retention evidence is used only for skill SELECTION among already-eligible
 * procedures. It never becomes factual corroboration and never increases answer confidence.
 */
export async function retrieveValidatedCognitiveSkills(prompt: string): Promise<CognitiveSkillContextResult> {
  const empty: CognitiveSkillContextResult = { retrieved: 0, relevant: 0, selected: 0, dependencyRejected: 0, items: [] }
  const db = cosServiceDb()
  if (!db) return empty

  const result = await db
    .from('cos_cognitive_skills')
    .select('id,skill_key,subject,title,description,procedure,status,last_validated_at,updated_at,provenance,production_attempts,production_successes,retention_attempts,retention_successes,failure_count')
    .in('status', ['validated', 'learned', 'mastered'])
    .order('last_validated_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(32)

  if (result.error) {
    console.warn('[cos-cognitive-skill-context] retrieval failed', result.error)
    return empty
  }

  const rows = result.data ?? []
  const dependency = await dependencyHealth(rows)
  const healthyRows = rows.filter((row: any) => dependency.get(String(row.skill_key)) !== false)
  const dependencyRejected = rows.length - healthyRows.length
  const candidates = healthyRows.map(row => ({
    item: row,
    text: [
      safe(row.subject, 300),
      safe(row.title, 300),
      safe(row.description, 1000),
      safe(JSON.stringify(row.procedure ?? {}), 4000),
    ].filter(Boolean).join(' '),
  }))
  const ranked = await rankContextCandidates(prompt, candidates, { threshold: threshold(), limit: 8 })

  const assessed = ranked.relevant.map(candidate => {
    const row: any = candidate.item
    const status = String(row.status) as CognitiveSkillContextItem['status']
    const selection = assessSkillSelection({
      status,
      similarity: candidate.similarity,
      productionAttempts: Number(row.production_attempts || 0),
      productionSuccesses: Number(row.production_successes || 0),
      retentionAttempts: Number(row.retention_attempts || 0),
      retentionSuccesses: Number(row.retention_successes || 0),
      failureCount: Number(row.failure_count || 0),
      dependencyHealthy: dependency.get(String(row.skill_key)) !== false,
    })
    return { candidate, status, selection }
  }).filter(entry => entry.selection.eligible)
    .sort((a, b) => b.selection.selectionScore - a.selection.selectionScore)
    .slice(0, 4)

  return {
    retrieved: rows.length,
    relevant: ranked.relevant.length,
    selected: assessed.length,
    dependencyRejected,
    items: assessed.map((entry, index) => {
      const row: any = entry.candidate.item
      return {
        id: String(row.id),
        skillKey: safe(row.skill_key, 240),
        status: entry.status,
        similarity: entry.candidate.similarity,
        selectionScore: entry.selection.selectionScore,
        evidenceReliability: entry.selection.evidenceReliability,
        line: `[SK${index + 1}] [skill_key=${safe(row.skill_key, 240)}] ${safe(row.title, 240)} — ${safe(row.description, 900)} Procedure: ${safe(JSON.stringify(row.procedure ?? {}), 3000)} [status ${entry.status}; semantic relevance ${entry.candidate.similarity.toFixed(2)}; selection evidence ${entry.selection.evidenceReliability.toFixed(2)}; procedural guidance only, not factual evidence]`,
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
