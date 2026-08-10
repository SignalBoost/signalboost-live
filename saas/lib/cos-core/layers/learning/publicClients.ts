import type { LearningConnectorSearch, LearningConnectorResult } from './connectors'

async function getJson(url: string): Promise<any> {
  const response = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'SignalBoost-COS/1.0' } })
  if (!response.ok) throw new Error(`COS learning source failed: ${response.status}`)
  return response.json()
}

function clean(value: unknown): string {
  return String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Crossref: scholarly metadata/abstracts where publishers expose them. No API key required. */
export const crossrefScientificSearch: LearningConnectorSearch = async (query, limit) => {
  const json = await getJson(`https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${Math.min(limit, 10)}&select=DOI,title,abstract,published,URL,publisher`)
  return (json?.message?.items ?? []).map((item: any): LearningConnectorResult => ({
    uri: item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : ''),
    title: clean(item.title?.[0]),
    text: clean(item.abstract || `${item.title?.[0] ?? ''}. Publisher: ${item.publisher ?? ''}`),
    license: 'metadata/abstract as supplied by Crossref',
  })).filter((x: LearningConnectorResult) => x.uri && x.text)
}

/** OpenAlex: open scholarly graph for works, authors and institutions. No API key required. */
export const openAlexScientificSearch: LearningConnectorSearch = async (query, limit) => {
  const json = await getJson(`https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${Math.min(limit, 10)}`)
  return (json?.results ?? []).map((item: any): LearningConnectorResult => ({
    uri: item.doi || item.id,
    title: clean(item.title),
    text: clean(`${item.title ?? ''}. ${item.primary_topic?.display_name ?? ''}. Cited by ${item.cited_by_count ?? 0}.`),
    license: item.open_access?.is_oa ? 'open-access metadata' : 'metadata only',
  })).filter((x: LearningConnectorResult) => x.uri && x.text)
}

/** Open Library: library/book discovery metadata. No API key required. */
export const openLibrarySearch: LearningConnectorSearch = async (query, limit) => {
  const json = await getJson(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${Math.min(limit, 10)}`)
  return (json?.docs ?? []).map((item: any): LearningConnectorResult => ({
    uri: item.key ? `https://openlibrary.org${item.key}` : '',
    title: clean(item.title),
    text: clean(`${item.title ?? ''}. ${item.author_name?.join(', ') ?? ''}. First published ${item.first_publish_year ?? 'unknown'}. Subjects: ${item.subject?.slice(0, 8).join(', ') ?? ''}.`),
    license: 'Open Library metadata',
  })).filter((x: LearningConnectorResult) => x.uri && x.text)
}

/** Europe PMC: biomedical/life-sciences literature and open-access research metadata. */
export const europePmcScientificSearch: LearningConnectorSearch = async (query, limit) => {
  const json = await getJson(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&pageSize=${Math.min(limit, 10)}&format=json`)
  return (json?.resultList?.result ?? []).map((item: any): LearningConnectorResult => ({
    uri: item.doi ? `https://doi.org/${item.doi}` : item.pmcid ? `https://europepmc.org/article/PMC/${item.pmcid.replace(/^PMC/, '')}` : '',
    title: clean(item.title),
    text: clean(`${item.title ?? ''}. ${item.authorString ?? ''}. ${item.journalTitle ?? ''} ${item.pubYear ?? ''}.`),
    license: item.isOpenAccess === 'Y' ? 'open-access metadata' : 'metadata only',
  })).filter((x: LearningConnectorResult) => x.uri && x.text)
}
