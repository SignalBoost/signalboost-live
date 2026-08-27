import { getExternalInfo } from '../tools/getExternalInfo.ts'
import { crossrefScientificSearch } from '../../cos-core/layers/learning/publicClients.ts'
import {
  asksForPublishedDiagnosticMethods,
  diagnosticPublishedSearchQuery,
  selectOfficialDiagnosticReferences,
  type PublishedDiagnosticReference,
} from './advisoryDiagnosisPolicy.ts'

export type PublishedDiagnosticLookupResult = {
  attempted: boolean
  references: PublishedDiagnosticReference[]
  errors: string[]
}

function clean(value: unknown, max = 700): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function journalReferences(rows: Awaited<ReturnType<typeof crossrefScientificSearch>>, limit = 2): PublishedDiagnosticReference[] {
  const references: PublishedDiagnosticReference[] = []
  const seen = new Set<string>()
  for (const row of rows || []) {
    const url = clean(row.uri, 500)
    const title = clean(row.title, 200)
    const snippet = clean(row.text, 700)
    if (!url || !title || !snippet || seen.has(url)) continue
    seen.add(url)
    references.push({ kind: 'scientific_journal', title, url, snippet })
    if (references.length >= Math.max(1, Math.min(3, limit))) break
  }
  return references
}

/**
 * Request-time reference research for advisory diagnosis only.
 *
 * This is deliberately NOT a telemetry path. Generic web results survive only when the existing
 * authority classifier marks them first-party or institutional; journal candidates come only from
 * the existing Crossref scientific client. The result is reference knowledge about methods and
 * mechanisms, never evidence that a live plant/service actually exhibited a condition.
 */
export async function retrievePublishedDiagnosticReferences(prompt: string): Promise<PublishedDiagnosticLookupResult> {
  if (!asksForPublishedDiagnosticMethods(prompt)) return { attempted: false, references: [], errors: [] }

  const baseQuery = diagnosticPublishedSearchQuery(prompt)
  const officialQuery = `${baseQuery} official documentation`.slice(0, 380)
  const errors: string[] = []
  const [officialSettled, journalSettled] = await Promise.allSettled([
    getExternalInfo(officialQuery, 6, { bypassCache: false }),
    crossrefScientificSearch(baseQuery, 3),
  ])

  let official: PublishedDiagnosticReference[] = []
  let journals: PublishedDiagnosticReference[] = []

  if (officialSettled.status === 'fulfilled') {
    if (officialSettled.value.ok) official = selectOfficialDiagnosticReferences(officialSettled.value.results, 2)
    else if (officialSettled.value.error) errors.push(`official:${clean(officialSettled.value.error, 240)}`)
  } else {
    errors.push(`official:${clean(officialSettled.reason instanceof Error ? officialSettled.reason.message : officialSettled.reason, 240)}`)
  }

  if (journalSettled.status === 'fulfilled') journals = journalReferences(journalSettled.value, 2)
  else errors.push(`journal:${clean(journalSettled.reason instanceof Error ? journalSettled.reason.message : journalSettled.reason, 240)}`)

  const references: PublishedDiagnosticReference[] = []
  const seen = new Set<string>()
  for (const reference of [...official, ...journals]) {
    if (seen.has(reference.url)) continue
    seen.add(reference.url)
    references.push(reference)
    if (references.length >= 4) break
  }

  return { attempted: true, references, errors }
}
