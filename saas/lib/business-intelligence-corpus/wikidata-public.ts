import { lookupCorpus, corpusCount, upsertCorpusRecord } from './service.ts'
import type { BusinessIntelligenceRecord } from './contracts.ts'
import { persistCorpusIntelligence } from './integration.ts'
import {
  parseWikidataCompanyBindings,
  type WikidataCompanyCandidate,
  type WikidataSparqlBinding,
} from './wikidata-public-parser.ts'

const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql'
const WIKIDATA_BUSINESS_QID = 'Q4830453'
const MAX_BATCH = 250
const LOOKUP_CONCURRENCY = 20
const APPLY_CONCURRENCY = 5
const DAY_MS = 86_400_000

function boundedInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

function buildQuery(limit: number, offset: number): string {
  return `SELECT ?item ?itemLabel ?website WHERE {
  ?item wdt:P31 wd:${WIKIDATA_BUSINESS_QID};
        wdt:P856 ?website;
        rdfs:label ?itemLabel.
  FILTER(LANG(?itemLabel) = "en")
}
LIMIT ${limit}
OFFSET ${offset}`
}

export async function fetchWikidataCompanyCandidates(args: { limit?: number; offset?: number } = {}): Promise<{
  requested: number
  offset: number
  candidates: WikidataCompanyCandidate[]
}> {
  const limit = boundedInt(args.limit, 100, 1, MAX_BATCH)
  const offset = boundedInt(args.offset, 0, 0, 100_000)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25_000)
  try {
    const url = new URL(WIKIDATA_SPARQL)
    url.searchParams.set('query', buildQuery(limit, offset))
    url.searchParams.set('format', 'json')
    const response = await fetch(url, {
      headers: {
        Accept: 'application/sparql-results+json',
        'User-Agent': 'SignalBoost-COS-Business-Intelligence-Corpus/1.0 (public-data seed; https://github.com/SignalBoost/signalboost-live)',
      },
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`WIKIDATA_QUERY_FAILED_${response.status}`)
    const payload = await response.json() as { results?: { bindings?: WikidataSparqlBinding[] } }
    return {
      requested: limit,
      offset,
      candidates: parseWikidataCompanyBindings(payload.results?.bindings || []),
    }
  } finally {
    clearTimeout(timer)
  }
}

function candidateToRecord(candidate: WikidataCompanyCandidate, now = new Date()): BusinessIntelligenceRecord {
  const verifiedAt = now.toISOString()
  return {
    canonicalDomain: candidate.canonicalDomain,
    companyName: candidate.companyName,
    aliases: [],
    industry: candidate.industry,
    country: candidate.country,
    website: candidate.website,
    technologies: [],
    contacts: [],
    attributes: {
      publicKnowledgeSource: 'wikidata',
      wikidataEntityId: candidate.qid,
      wikidataItemUrl: candidate.itemUrl,
      classificationEvidence: `P31:${WIKIDATA_BUSINESS_QID}`,
      officialWebsiteEvidence: 'P856',
      sourceDatasetLicense: 'CC0',
      sourceAcquisition: 'bounded_wikidata_query_service',
      canonicalWebsiteSelection: 'prefer_root_path_then_shortest_domain_then_shortest_url',
      externalProviderCalls: 0,
      externalAiCalls: 0,
    },
    confidence: 0.82,
    sourceType: 'learned',
    sourceIds: [`wikidata:${candidate.qid}`],
    verifiedAt,
    refreshedAt: verifiedAt,
    expiresAt: new Date(now.getTime() + 90 * DAY_MS).toISOString(),
  }
}

async function mapConcurrent<T, R>(items: readonly T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(items.length)
  let cursor = 0
  async function worker() {
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      const item = items[index]
      if (item === undefined) return
      output[index] = await fn(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return output
}

export async function seedCorpusFromWikidataPublic(args: { apply?: boolean; limit?: number; offset?: number } = {}) {
  const apply = args.apply === true
  const fetched = await fetchWikidataCompanyCandidates(args)
  const checks = await mapConcurrent(fetched.candidates, LOOKUP_CONCURRENCY, async candidate => ({
    candidate,
    lookup: await lookupCorpus({
      query: candidate.canonicalDomain,
      canonicalDomain: candidate.canonicalDomain,
      minConfidence: 0,
      requireFresh: false,
    }),
  }))
  const missing = checks.filter(item => !item.lookup.hit).map(item => item.candidate)
  const before = await corpusCount()
  const failures: Array<{ qid: string; canonicalDomain: string; error: string }> = []
  let succeeded = 0

  if (apply) {
    const outcomes = await mapConcurrent(missing, APPLY_CONCURRENCY, async candidate => {
      try {
        const saved = await upsertCorpusRecord(candidateToRecord(candidate))
        await persistCorpusIntelligence({ record: saved })
        return { ok: true as const, candidate }
      } catch (error) {
        return {
          ok: false as const,
          candidate,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    })
    for (const outcome of outcomes) {
      if (outcome.ok) succeeded += 1
      else failures.push({ qid: outcome.candidate.qid, canonicalDomain: outcome.candidate.canonicalDomain, error: outcome.error })
    }
  }

  const after = apply ? await corpusCount() : before
  return {
    source: 'wikidata',
    sourceClass: 'public_cc0_structured_knowledge',
    mode: apply ? 'apply' : 'dry_run',
    providerCalls: 0,
    externalAiCalls: 0,
    requested: fetched.requested,
    offset: fetched.offset,
    fetchedCandidates: fetched.candidates.length,
    alreadyPresent: fetched.candidates.length - missing.length,
    newCandidates: missing.length,
    attempted: apply ? missing.length : 0,
    succeeded,
    failed: failures.length,
    failures: failures.slice(0, 25),
    before,
    after,
    netAdded: Math.max(0, after - before),
    nextOffset: fetched.offset + fetched.requested,
    candidates: missing.slice(0, 50).map(candidate => ({
      qid: candidate.qid,
      companyName: candidate.companyName,
      canonicalDomain: candidate.canonicalDomain,
      country: candidate.country || null,
      industry: candidate.industry || null,
      confidence: 0.82,
    })),
  }
}
