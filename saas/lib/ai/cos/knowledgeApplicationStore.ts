import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { MAX_REOPEN_PER_CYCLE, scanKnowledgeApplication, selectReopenBatch, summarizeApplicationScan, type ApplicationCandidate, type DormantQuestionRow, type RetainedKnowledgeRow } from '@/lib/ai/cos/knowledgeApplicationScan'

export const DEFAULT_LOOKBACK_DAYS = 14
const DORMANT_QUERY_LIMIT = 200
const KNOWLEDGE_QUERY_LIMIT = 200
const EVENT_REPORT_LIMIT = 50

export type KnowledgeApplicationSummary = {
  enabled: boolean; dormantExamined: number; knowledgeExamined: number; reopened: number
  verdicts: ReturnType<typeof summarizeApplicationScan> | null
  reopenedGaps: Array<{ gapId: string; subject: string; sourceKind: string | null; coverage: number }>
  errors: string[]
}

function sinceIso(lookbackDays: number): string { const days = Math.max(1, Math.min(90, Math.floor(lookbackDays))); return new Date(Date.now() - days * 86400000).toISOString() }
function toDormantRow(row: Record<string, unknown>): DormantQuestionRow { return { id: String(row.id || ''), subject: String(row.subject || ''), question: String(row.question || ''), status: String(row.status || ''), autopsyVerdict: row.autopsy_verdict == null ? null : String(row.autopsy_verdict), autopsyAt: row.autopsy_at == null ? null : String(row.autopsy_at), lastSeenAt: row.last_seen_at == null ? null : String(row.last_seen_at), attemptCount: Number(row.attempt_count ?? 0), reopenedCount: Number(row.reopened_count ?? 0) } }
function toKnowledgeRow(row: Record<string, unknown>): RetainedKnowledgeRow { return { contentHash: String(row.content_hash || ''), subject: String(row.subject || ''), summary: String(row.summary || ''), sourceKind: String(row.source_kind || ''), sourceTitle: row.source_title == null ? null : String(row.source_title), observedAt: row.observed_at == null ? null : String(row.observed_at), createdAt: row.created_at == null ? null : String(row.created_at), confidence: Number(row.confidence ?? 0) } }

async function recordApplicationEvents(db: any, batch: ApplicationCandidate[]): Promise<string[]> {
  if (!batch.length) return []
  try {
    const { error } = await db.from('cos_knowledge_application_events').insert(batch.map(candidate => ({ gap_id: candidate.gapId, gap_subject: candidate.gapSubject, content_hash: candidate.contentHash, source_kind: candidate.sourceKind, matched_terms: candidate.matchedTerms, coverage: candidate.coverage, verdict: candidate.verdict, rationale: candidate.rationale })))
    return error ? [`events:${String(error.message || error).slice(0, 300)}`] : []
  } catch (error) { return [`events:${error instanceof Error ? error.message.slice(0, 300) : 'insert failed'}`] }
}

export async function runKnowledgeApplicationScan(options: { lookbackDays?: number; maxReopen?: number; dryRun?: boolean } = {}): Promise<KnowledgeApplicationSummary> {
  const summary: KnowledgeApplicationSummary = { enabled: false, dormantExamined: 0, knowledgeExamined: 0, reopened: 0, verdicts: null, reopenedGaps: [], errors: [] }
  const db = cosServiceDb()
  if (!db) return summary
  summary.enabled = true
  let dormant: DormantQuestionRow[] = []
  let knowledge: RetainedKnowledgeRow[] = []
  try { const { data, error } = await db.from('cos_learning_gaps').select('id,subject,question,status,autopsy_verdict,autopsy_at,last_seen_at,attempt_count,reopened_count').in('status', ['retired', 'failed', 'unstudyable']).order('last_seen_at', { ascending: false }).limit(DORMANT_QUERY_LIMIT); if (error) summary.errors.push(`gaps:${String(error.message || error).slice(0, 300)}`); dormant = ((data || []) as Array<Record<string, unknown>>).map(toDormantRow).filter(row => row.id) } catch (error) { summary.errors.push(`gaps:${error instanceof Error ? error.message.slice(0, 300) : 'read failed'}`) }
  try { const { data, error } = await db.from('cos_continuous_learning').select('content_hash,subject,summary,source_kind,source_title,observed_at,created_at,confidence').gte('created_at', sinceIso(options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS)).order('created_at', { ascending: false }).limit(KNOWLEDGE_QUERY_LIMIT); if (error) summary.errors.push(`knowledge:${String(error.message || error).slice(0, 300)}`); knowledge = ((data || []) as Array<Record<string, unknown>>).map(toKnowledgeRow).filter(row => row.contentHash) } catch (error) { summary.errors.push(`knowledge:${error instanceof Error ? error.message.slice(0, 300) : 'read failed'}`) }
  summary.dormantExamined = dormant.length; summary.knowledgeExamined = knowledge.length
  if (!dormant.length || !knowledge.length) return summary
  const candidates = scanKnowledgeApplication(dormant, knowledge); summary.verdicts = summarizeApplicationScan(candidates)
  const batch = selectReopenBatch(candidates, options.maxReopen ?? MAX_REOPEN_PER_CYCLE)
  if (!batch.length || options.dryRun) return summary
  summary.errors.push(...await recordApplicationEvents(db, batch))
  const counts = new Map(dormant.map(row => [row.id, Math.max(0, Math.floor(Number(row.reopenedCount ?? 0)))])); const now = new Date().toISOString()
  for (const candidate of batch) {
    try { const { error } = await db.from('cos_learning_gaps').update({ status: 'pending', autopsy_at: null, autopsy_verdict: null, resolved_at: null, last_seen_at: now, last_reopened_at: now, reopened_count: (counts.get(candidate.gapId) ?? 0) + 1, reopen_reason: candidate.rationale.slice(0, 500) }).eq('id', candidate.gapId); if (error) { summary.errors.push(`reopen:${String(error.message || error).slice(0, 300)}`); continue }; summary.reopened += 1; summary.reopenedGaps.push({ gapId: candidate.gapId, subject: candidate.gapSubject, sourceKind: candidate.sourceKind, coverage: candidate.coverage }) } catch (error) { summary.errors.push(`reopen:${error instanceof Error ? error.message.slice(0, 300) : 'update failed'}`) }
  }
  return summary
}

export type KnowledgeApplicationReport = { ok: boolean; error?: string; dormantByStatus?: Record<string, number>; recentEvents?: Array<Record<string, unknown>> }
export async function readKnowledgeApplicationReport(limit = EVENT_REPORT_LIMIT): Promise<KnowledgeApplicationReport> {
  const db = cosServiceDb(); if (!db) return { ok: false, error: 'COS service database is not configured' }
  const dormantByStatus: Record<string, number> = {}
  try { const { data, error } = await db.from('cos_learning_gaps').select('status,autopsy_verdict').in('status', ['retired', 'failed', 'unstudyable']).limit(DORMANT_QUERY_LIMIT); if (error) return { ok: false, error: String(error.message || error).slice(0, 300) }; for (const row of (data || []) as Array<Record<string, unknown>>) { const key = `${String(row.status || 'unknown')}:${String(row.autopsy_verdict || 'none')}`; dormantByStatus[key] = (dormantByStatus[key] || 0) + 1 } } catch (error) { return { ok: false, error: error instanceof Error ? error.message.slice(0, 300) : 'read failed' } }
  let recentEvents: Array<Record<string, unknown>> = []
  try { const { data } = await db.from('cos_knowledge_application_events').select('*').order('created_at', { ascending: false }).limit(Math.max(1, Math.min(200, Math.floor(limit)))); recentEvents = (data || []) as Array<Record<string, unknown>> } catch { recentEvents = [] }
  return { ok: true, dormantByStatus, recentEvents }
}
