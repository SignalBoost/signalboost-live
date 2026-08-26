// saas/lib/ai/cos/publicCorpusEvidence.ts
//
// LEARNED-CORPUS EVIDENCE FOR THE PUBLIC CHANNEL, RESTRICTED AT THE SOURCE.
//
// Owner-directed architecture: COS is the only reasoner and the Concierge renders passively, so
// the public channel should reason from the same material — but company information must never
// reach it, and the boundary is enforced HERE rather than by filtering the answer afterwards.
// A renderer that filters is one miss away from a leak; a reasoner that never received the row
// has nothing to leak.
//
// WHY AN ALLOWLIST AND NOT A DENYLIST. cos_continuous_learning holds public research material
// alongside internally-derived rows — 'user_feedback', 'verified_objective_outcome' and
// 'external_teacher' all live in the same table, and owner-directed study material is admitted
// through the same pipeline. A denylist would silently admit any source kind added later. This
// allowlist admits five kinds and excludes everything else, including anything unrecognised, so
// a new kind is private until someone deliberately makes it public.
//
// The owner path is unchanged and still sees the whole corpus.

/**
 * Source kinds a visitor may see. Each is externally published material that carries no
 * SignalBoost-specific information.
 */
export const PUBLIC_CORPUS_SOURCE_KINDS: readonly string[] = [
  'approved_public_web',
  'news_article',
  'official_documentation',
  'scientific_journal',
  'video_transcript',
]

/** True when a corpus row may be shown to an anonymous visitor. */
export function isPublicCorpusSourceKind(sourceKind: unknown): boolean {
  return PUBLIC_CORPUS_SOURCE_KINDS.includes(String(sourceKind ?? '').trim().toLowerCase())
}

/**
 * Retain only rows a visitor may see.
 *
 * Fail-safe by construction: a row with a missing, empty, unknown or newly-added source kind is
 * dropped. Anything that is not explicitly public is treated as private.
 */
export function filterPublicCorpusRows<T extends { source_kind?: unknown }>(rows: readonly T[]): T[] {
  if (!Array.isArray(rows)) return []
  return rows.filter(row => isPublicCorpusSourceKind(row?.source_kind))
}

/** Counts for the provenance funnel, so the public answer reports honestly what it consulted. */
export interface PublicCorpusFunnel {
  retrieved: number
  publicEligible: number
  excludedPrivate: number
}

export function publicCorpusFunnel<T extends { source_kind?: unknown }>(
  rows: readonly T[],
): PublicCorpusFunnel {
  const retrieved = Array.isArray(rows) ? rows.length : 0
  const publicEligible = filterPublicCorpusRows(rows).length
  return { retrieved, publicEligible, excludedPrivate: retrieved - publicEligible }
}
