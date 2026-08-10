import assert from 'node:assert/strict'
import test from 'node:test'
import { curatedProspectsAsCorpusRecords } from '../lib/business-intelligence-corpus/seed-curated-prospects.ts'

test('existing COS curated prospects convert into valid corpus records', () => {
  const records = curatedProspectsAsCorpusRecords()
  assert.equal(records.length, 23)
  assert.equal(new Set(records.map(record => record.canonicalDomain)).size, records.length)
  for (const record of records) {
    assert.ok(record.companyName)
    assert.ok(record.canonicalDomain)
    assert.equal(record.sourceType, 'curated')
    assert.ok(record.confidence >= 0.78)
    assert.ok(record.sourceIds.length >= 1)
  }
})
