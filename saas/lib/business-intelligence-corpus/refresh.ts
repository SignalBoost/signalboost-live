import { getAdminSupabase } from '@/utils/supabase/server'
import { resolveBusinessIntelligence } from './orchestrator.ts'
import { configuredCorpusProviderEnrichers } from './provider-enrichers.ts'

export async function runCorpusRefreshBatch(limit = 25) {
  const admin = getAdminSupabase()
  const { data: jobs, error } = await admin
    .from('business_intelligence_corpus_refresh_queue')
    .select('*')
    .eq('status', 'queued')
    .order('priority', { ascending: false })
    .order('requested_at', { ascending: true })
    .limit(Math.max(1, Math.min(100, limit)))
  if (error) throw new Error(error.message)

  const enrichers = configuredCorpusProviderEnrichers()
  const results: Array<{ id: string; ok: boolean; domain: string; source?: string; error?: string }> = []

  for (const job of jobs ?? []) {
    await admin.from('business_intelligence_corpus_refresh_queue').update({ status: 'running', started_at: new Date().toISOString() }).eq('id', job.id)
    try {
      const resolved = await resolveBusinessIntelligence({
        lookup: { query: job.canonical_domain, canonicalDomain: job.canonical_domain, requireFresh: true },
        enrichers,
      })
      if (!resolved) throw new Error('CORPUS_REFRESH_NO_RESULT')
      await admin.from('business_intelligence_corpus_refresh_queue').update({ status: 'completed', finished_at: new Date().toISOString(), error: null }).eq('id', job.id)
      results.push({ id: job.id, ok: true, domain: job.canonical_domain, source: resolved.source })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'CORPUS_REFRESH_FAILED'
      await admin.from('business_intelligence_corpus_refresh_queue').update({ status: 'failed', finished_at: new Date().toISOString(), error: message.slice(0, 500) }).eq('id', job.id)
      results.push({ id: job.id, ok: false, domain: job.canonical_domain, error: message })
    }
  }

  return { processed: results.length, succeeded: results.filter(item => item.ok).length, failed: results.filter(item => !item.ok).length, results }
}

export async function queueStaleCorpusRecords(limit = 250) {
  const admin = getAdminSupabase()
  const { data, error } = await admin
    .from('business_intelligence_corpus')
    .select('id,canonical_domain,confidence,expires_at')
    .or(`expires_at.lte.${new Date().toISOString()},confidence.lt.0.78`)
    .order('confidence', { ascending: true })
    .limit(Math.max(1, Math.min(1000, limit)))
  if (error) throw new Error(error.message)

  let queued = 0
  for (const row of data ?? []) {
    const { data: existing } = await admin.from('business_intelligence_corpus_refresh_queue').select('id').eq('canonical_domain', row.canonical_domain).in('status', ['queued', 'running']).maybeSingle()
    if (existing) continue
    const reason = Number(row.confidence) < 0.78 ? 'low_confidence' : 'stale'
    const { error: insertError } = await admin.from('business_intelligence_corpus_refresh_queue').insert({
      corpus_id: row.id,
      canonical_domain: row.canonical_domain,
      reason,
      priority: reason === 'low_confidence' ? 90 : 70,
      status: 'queued',
    })
    if (!insertError) queued += 1
  }
  return { scanned: (data ?? []).length, queued }
}
