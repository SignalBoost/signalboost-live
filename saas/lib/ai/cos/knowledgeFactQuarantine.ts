import type { SupabaseClient } from '@supabase/supabase-js'

export const RELEVANCE_REJECTED_PREFIX = 'relevance_rejected:'

type SourceBackedFact = { source?: string | null }

export function excludeQuarantinedFactSources<T extends SourceBackedFact>(rows: T[], quarantinedSources: Iterable<string>): T[] {
  const blocked = new Set([...quarantinedSources].map(value => String(value ?? '').trim()).filter(Boolean))
  if (!blocked.size) return rows
  return rows.filter(row => !blocked.has(String(row.source ?? '').trim()))
}

/**
 * Return only KG facts whose learned-corpus source is still eligible for durable reuse.
 *
 * Relevance rejection is intentionally stored on the learned source rather than by mutating or
 * deleting historical facts. That preserves audit evidence while making the derived facts inert.
 * Sources that never came from continuous learning are unaffected.
 */
export async function filterQuarantinedKnowledgeFacts<T extends SourceBackedFact>(db: SupabaseClient, rows: T[]): Promise<T[]> {
  if (!rows.length) return rows
  const sources = [...new Set(rows.map(row => String(row.source ?? '').trim()).filter(Boolean))]
  if (!sources.length) return rows

  const { data, error } = await db.from('cos_continuous_learning')
    .select('source_uri')
    .in('source_uri', sources)
    .like('fact_extraction_error', `${RELEVANCE_REJECTED_PREFIX}%`)

  if (error) {
    // Fail closed on the audit lookup: if COS cannot determine whether a continuous-learning fact
    // was quarantined, do not strengthen a response with potentially rejected derived knowledge.
    throw error
  }

  return excludeQuarantinedFactSources(rows, (data ?? []).map(row => String(row.source_uri ?? '')))
}
