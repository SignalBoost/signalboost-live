import assert from 'node:assert/strict'
import test from 'node:test'
import { getCuratedProspects, searchCuratedProspects } from '../lib/prospect-intelligence/curatedSource.ts'

test('curated prospect source is populated with real records', () => {
  const rows = getCuratedProspects()
  assert.ok(rows.length >= 20)
  assert.ok(rows.every(row => row.company && row.website && row.status === 'READY'))
})

test('curated lookup filters by country and preserves usable email', () => {
  const rows = searchCuratedProspects({ country: 'PL', requireEmail: true, limit: 50 })
  assert.ok(rows.length >= 10)
  assert.ok(rows.every(row => row.country === 'PL'))
  assert.ok(rows.every(row => /@/.test(row.email)))
})

test('curated lookup ranks stronger prospects first', () => {
  const rows = searchCuratedProspects({ country: 'US', limit: 12 })
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1].technicalFit + rows[index - 1].revenuePotential
    const current = rows[index].technicalFit + rows[index].revenuePotential
    assert.ok(previous >= current)
  }
})
