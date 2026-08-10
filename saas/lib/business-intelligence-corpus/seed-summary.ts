import { curatedProspectsAsCorpusRecords } from './seed-curated-prospects.ts'

export function curatedCorpusSeedSummary() {
  const records = curatedProspectsAsCorpusRecords()
  return {
    count: records.length,
    countries: [...new Set(records.map(record => record.country).filter(Boolean))].sort(),
    companies: records.map(record => ({
      companyName: record.companyName,
      canonicalDomain: record.canonicalDomain,
      country: record.country,
      industry: record.industry,
      confidence: record.confidence,
    })),
  }
}
