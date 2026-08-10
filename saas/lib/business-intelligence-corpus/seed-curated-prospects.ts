import curated from '@/data/prospects.json'
import { normalizeDomain, type BusinessIntelligenceRecord } from './contracts.ts'
import { corpusCount, upsertCorpusRecord } from './service.ts'

const DAY_MS = 86_400_000

function confidenceFromProspect(row: any) {
  const technical = Math.max(0, Math.min(100, Number(row.technicalFit) || 0))
  const revenue = Math.max(0, Math.min(100, Number(row.revenuePotential) || 0))
  // Technical fit is stronger evidence of corpus usefulness; revenue potential
  // contributes to confidence but does not dominate factual company identity.
  return Math.max(0.78, Math.min(0.99, (technical * 0.7 + revenue * 0.3) / 100))
}

export function curatedProspectsAsCorpusRecords(): BusinessIntelligenceRecord[] {
  const verifiedAt = typeof (curated as any).updatedAt === 'string'
    ? (curated as any).updatedAt
    : new Date().toISOString()
  const expiresAt = new Date(Date.parse(verifiedAt) + 30 * DAY_MS).toISOString()
  const rows = Array.isArray((curated as any).prospects) ? (curated as any).prospects : []

  return rows
    .filter((row: any) => row?.status === 'READY')
    .map((row: any) => {
      const canonicalDomain = normalizeDomain(String(row.website || ''))
      return {
        canonicalDomain,
        companyName: String(row.company || '').trim(),
        aliases: [],
        industry: String(row.industry || '').trim() || undefined,
        country: String(row.country || '').trim() || undefined,
        website: String(row.website || '').trim() || undefined,
        contacts: row.email ? [{ email: String(row.email).trim() }] : [],
        attributes: {
          curatedProspectId: String(row.id || ''),
          technicalFit: Number(row.technicalFit) || 0,
          revenuePotential: Number(row.revenuePotential) || 0,
          status: String(row.status || ''),
        },
        confidence: confidenceFromProspect(row),
        sourceType: 'curated' as const,
        sourceIds: [String(row.id || '')].filter(Boolean),
        verifiedAt,
        refreshedAt: verifiedAt,
        expiresAt,
      }
    })
    .filter((record: BusinessIntelligenceRecord) => Boolean(record.canonicalDomain && record.companyName))
}

export async function seedCorpusFromCuratedProspects() {
  const records = curatedProspectsAsCorpusRecords()
  const before = await corpusCount()
  let succeeded = 0
  const failures: Array<{ companyName: string; error: string }> = []

  for (const record of records) {
    try {
      await upsertCorpusRecord(record)
      succeeded += 1
    } catch (error) {
      failures.push({
        companyName: record.companyName,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const after = await corpusCount()
  return {
    source: 'saas/data/prospects.json',
    discovered: records.length,
    attempted: records.length,
    succeeded,
    failed: failures.length,
    failures,
    before,
    after,
    netAdded: Math.max(0, after - before),
  }
}
