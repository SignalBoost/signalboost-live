import type { BusinessIntelligenceRecord } from './contracts.ts'
import { upsertCorpusRecord } from './service.ts'
import { persistCorpusIntelligence } from './integration.ts'

export async function importCuratedCorpus(records: readonly BusinessIntelligenceRecord[]) {
  if (!Array.isArray(records) || records.length === 0) return { received: 0, imported: 0, failed: 0, errors: [] as string[] }
  if (records.length > 500) throw new Error('CORPUS_IMPORT_BATCH_LIMIT_500')

  let imported = 0
  const errors: string[] = []
  for (const record of records) {
    try {
      const saved = await upsertCorpusRecord({ ...record, sourceType: record.sourceType || 'curated' })
      await persistCorpusIntelligence({ record: saved })
      imported += 1
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'CORPUS_IMPORT_FAILED')
    }
  }
  return { received: records.length, imported, failed: records.length - imported, errors: errors.slice(0, 25) }
}
