function positiveInt(value: unknown, fallback: number, max = 100): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(1, Math.min(max, Math.floor(parsed))) : fallback
}

export type ProbationaryRow = { contentHash: string; subject: string; sourceUri: string }
export type ProbationaryPromotionSummary = { enabled: boolean; reviewed: number; promoted: string[]; stillPending: number; errors: string[] }

export async function selectPromotableProbationaryRows(rows: ProbationaryRow[], hasDurableCorroboration: (subject: string, excludeSourceUri: string) => Promise<boolean>): Promise<string[]> {
  const promoted: string[] = []
  for (const row of rows) if (await hasDurableCorroboration(row.subject, row.sourceUri).catch(() => false)) promoted.push(row.contentHash)
  return promoted
}

export async function runProbationaryPromotionCycle(): Promise<ProbationaryPromotionSummary> {
  if (process.env.COS_PROBATIONARY_PROMOTION_ENABLED === 'false') return { enabled: false, reviewed: 0, promoted: [], stillPending: 0, errors: [] }
  const summary: ProbationaryPromotionSummary = { enabled: true, reviewed: 0, promoted: [], stillPending: 0, errors: [] }
  try {
    const { cosServiceDb } = await import('@/lib/cos-core/storage/supabase')
    const db = cosServiceDb()
    if (!db) return summary
    const { data, error } = await db.from('cos_learning_probationary').select('*').eq('status', 'probationary').order('created_at', { ascending: true }).limit(positiveInt(process.env.COS_PROBATIONARY_PROMOTION_PER_CYCLE, 25))
    if (error) throw error
    const pending = data ?? []
    summary.reviewed = pending.length
    const selected = new Set(await selectPromotableProbationaryRows(pending.map((row: any) => ({ contentHash: String(row.content_hash), subject: String(row.subject), sourceUri: String(row.source_uri) })), async (subject, sourceUri) => {
      const result = await db.from('cos_continuous_learning').select('content_hash').eq('subject', subject).neq('source_uri', sourceUri).limit(1)
      if (result.error) throw result.error
      return Boolean(result.data?.length)
    }))
    const now = new Date().toISOString()
    for (const row of pending) {
      if (!selected.has(String(row.content_hash))) continue
      const copy = await db.from('cos_continuous_learning').upsert({ content_hash: row.content_hash, source_kind: row.source_kind, source_uri: row.source_uri, source_title: row.source_title, observed_at: row.observed_at, subject: row.subject, summary: row.summary, facts: row.facts, confidence: row.confidence, license: row.license, evidence: row.evidence }, { onConflict: 'content_hash' })
      if (copy.error) { summary.errors.push(`copy:${copy.error.message}`); continue }
      const flip = await db.from('cos_learning_probationary').update({ status: 'promoted', promoted_at: now }).eq('content_hash', row.content_hash).eq('status', 'probationary')
      if (flip.error) { summary.errors.push(`flip:${flip.error.message}`); continue }
      summary.promoted.push(String(row.content_hash))
    }
    summary.stillPending = summary.reviewed - summary.promoted.length
  } catch (error) { summary.errors.push(error instanceof Error ? error.message : String(error)) }
  return summary
}
