import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import type { CosFreshnessPolicy } from '@/lib/ai/cos/cosFreshnessPolicy'

export type FreshMemoryAuthority = 'primary' | 'institutional' | 'news'

export type FreshMemoryEvidenceSource = {
  id: string
  title: string
  url: string
  snippet: string
  observedAt: string
  ageMs: number
  sourceKind: string
  confidence: number
  authority: FreshMemoryAuthority
  host: string
  relevance: number
}

export type FreshMemoryEvidenceResult = {
  attempted: boolean
  sufficient: boolean
  cutoffAt: string | null
  sources: FreshMemoryEvidenceSource[]
  reason: string
}

const STOPWORDS = new Set([
  'the','a','an','and','or','of','to','in','on','for','with','from','is','are','was','were','who','what','when','where','which','how','does','did','has','have','current','currently','today','now','latest','right','present','please','tell','about','this','that','these','those','united',
])

function termsForPrompt(prompt: string): string[] {
  return [...new Set(String(prompt || '').toLowerCase().match(/[a-z0-9][a-z0-9+.#-]{2,}/g) || [])]
    .filter(term => !STOPWORDS.has(term))
    .slice(0, 10)
}

function hostFromUrl(value: string): string {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' }
}

function isGovernmentHost(host: string): boolean {
  return host.endsWith('.gov') || host.includes('.gov.') || host === 'gov.uk' || host.endsWith('.gov.uk') || host.endsWith('.gouv.fr') || host.endsWith('.gov.pl') || host.endsWith('.gov.br') || host.endsWith('.europa.eu')
}

function authorityFor(sourceKind: string, url: string): FreshMemoryAuthority {
  const host = hostFromUrl(url)
  if (isGovernmentHost(host) || sourceKind === 'official_documentation' || sourceKind === 'public_dataset') return 'primary'
  if (sourceKind === 'approved_public_web' || sourceKind === 'scientific_journal' || sourceKind === 'research_paper') return 'institutional'
  return 'news'
}

function lexicalRelevance(promptTerms: string[], text: string): number {
  if (!promptTerms.length) return 0
  const haystack = String(text || '').toLowerCase()
  const matched = promptTerms.filter(term => haystack.includes(term)).length
  return Number((matched / promptTerms.length).toFixed(4))
}

function safeObservedAt(value: unknown): string | null {
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

function queryFilter(terms: string[], columns: string[]): string {
  return terms.flatMap(term => columns.map(column => `${column}.ilike.%${term.replace(/[%_,]/g, '')}%`)).join(',')
}

function enoughRelevance(source: FreshMemoryEvidenceSource): boolean {
  return source.relevance >= 0.2
}

export function freshMemoryEvidenceIsSufficient(
  policy: CosFreshnessPolicy,
  sources: FreshMemoryEvidenceSource[],
): boolean {
  if (!policy.required || policy.forceLiveVerification) return false
  const relevant = sources.filter(enoughRelevance)
  if (!relevant.length) return false
  if (relevant.some(source => source.authority === 'primary' && source.confidence >= 0.65)) return true

  const corroborating = relevant.filter(source => source.confidence >= 0.6)
  const independentHosts = new Set(corroborating.map(source => source.host).filter(Boolean))
  return independentHosts.size >= 2
}

export async function retrieveFreshMemoryEvidence(
  prompt: string,
  policy: CosFreshnessPolicy,
  nowMs = Date.now(),
): Promise<FreshMemoryEvidenceResult> {
  if (!policy.required || policy.forceLiveVerification || policy.maxMemoryAgeMs == null || policy.maxMemoryAgeMs <= 0) {
    return {
      attempted: policy.required,
      sufficient: false,
      cutoffAt: null,
      sources: [],
      reason: policy.forceLiveVerification ? 'live_verification_forced' : 'no_memory_freshness_window',
    }
  }

  const db = cosServiceDb()
  if (!db) return { attempted:true, sufficient:false, cutoffAt:null, sources:[], reason:'memory_store_unavailable' }
  const terms = termsForPrompt(prompt)
  if (!terms.length) return { attempted:true, sufficient:false, cutoffAt:null, sources:[], reason:'no_retrieval_terms' }

  const cutoffMs = nowMs - policy.maxMemoryAgeMs
  const cutoffAt = new Date(cutoffMs).toISOString()
  const awarenessFilter = queryFilter(terms, ['source_title','snippet'])
  const learnedFilter = queryFilter(terms, ['subject','summary','source_title'])

  const [awarenessResult, learnedResult] = await Promise.all([
    db.from('cos_world_awareness')
      .select('source_uri,source_title,snippet,source_kind,observed_at,source_host')
      .gte('observed_at', cutoffAt)
      .gt('expires_at', new Date(nowMs).toISOString())
      .or(awarenessFilter)
      .order('observed_at', { ascending:false })
      .limit(40)
      .then(result => result)
      .catch(() => ({ data:[], error:null } as any)),
    db.from('cos_continuous_learning')
      .select('source_uri,source_title,summary,source_kind,observed_at,confidence,fact_extraction_error')
      .gte('observed_at', cutoffAt)
      .or(learnedFilter)
      .order('observed_at', { ascending:false })
      .order('confidence', { ascending:false })
      .limit(60)
      .then(result => result)
      .catch(() => ({ data:[], error:null } as any)),
  ])

  const candidates: FreshMemoryEvidenceSource[] = []
  for (const row of awarenessResult.data ?? []) {
    const observedAt = safeObservedAt(row.observed_at)
    if (!observedAt) continue
    const url = String(row.source_uri || '')
    const title = String(row.source_title || '')
    const snippet = String(row.snippet || '')
    const sourceKind = String(row.source_kind || 'news_article')
    const relevance = lexicalRelevance(terms, `${title} ${snippet}`)
    candidates.push({
      id:'', title, url, snippet, observedAt,
      ageMs:Math.max(0,nowMs-Date.parse(observedAt)),
      sourceKind,
      confidence:sourceKind==='official_documentation'?0.82:0.64,
      authority:authorityFor(sourceKind,url),
      host:String(row.source_host || hostFromUrl(url)),
      relevance,
    })
  }

  for (const row of learnedResult.data ?? []) {
    if (String(row.fact_extraction_error || '').toLowerCase().startsWith('relevance_rejected:')) continue
    const observedAt = safeObservedAt(row.observed_at)
    if (!observedAt) continue
    const url = String(row.source_uri || '')
    const title = String(row.source_title || row.source_kind || '')
    const snippet = String(row.summary || '')
    const sourceKind = String(row.source_kind || '')
    const relevance = lexicalRelevance(terms, `${title} ${snippet}`)
    candidates.push({
      id:'', title, url, snippet, observedAt,
      ageMs:Math.max(0,nowMs-Date.parse(observedAt)),
      sourceKind,
      confidence:Math.max(0,Math.min(1,Number(row.confidence || 0))),
      authority:authorityFor(sourceKind,url),
      host:hostFromUrl(url),
      relevance,
    })
  }

  const seen = new Set<string>()
  const sources = candidates
    .filter(source => source.url && source.relevance > 0)
    .sort((a,b) => {
      const authorityRank = (value:FreshMemoryAuthority) => value==='primary'?3:value==='institutional'?2:1
      return authorityRank(b.authority)-authorityRank(a.authority)
        || b.relevance-a.relevance
        || b.confidence-a.confidence
        || a.ageMs-b.ageMs
    })
    .filter(source => {
      const key=source.url.toLowerCase().replace(/\/$/,'')
      if(seen.has(key))return false
      seen.add(key);return true
    })
    .slice(0,8)
    .map((source,index)=>({ ...source, id:`MEM${index+1}` }))

  const sufficient = freshMemoryEvidenceIsSufficient(policy,sources)
  return {
    attempted:true,
    sufficient,
    cutoffAt,
    sources,
    reason:sufficient?'fresh_sourced_memory_available':sources.length?'memory_found_but_not_sufficiently_corroborated':'no_recent_relevant_sourced_memory',
  }
}
