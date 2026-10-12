// saas/tests/labTeacherRateCardsSeed.node.test.ts
// The first verified teacher prices: every row cites an official https page, prices are positive, the seed is
// idempotent, and the priced-model list honours price rows that have an end date.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../supabase/migrations/20261012060000_lab_teacher_rate_cards_seed.sql', import.meta.url), 'utf8')
const ROW = /\('([a-z_]+)',\s*'([^']+)',\s*([\d.]+),\s*([\d.]+),\s*'([^']+)',\s*'([^']+)',\s*(null|'[^']+')\)/g
const rows = [...sql.matchAll(ROW)].map(m => ({ kind: m[1], model: m[2], input: Number(m[3]), output: Number(m[4]), url: m[5], from: m[6], until: m[7] }))

test('every seeded price cites an official https page and is positive', () => {
  assert.equal(rows.length, 18)
  for (const row of rows) {
    assert.match(row.url, /^https:\/\//)
    assert.ok(row.input > 0 && row.output > 0, `${row.kind}/${row.model}`)
    assert.ok(row.input <= 1000 && row.output <= 1000)
  }
})

test('only one open-ended price per provider + model', () => {
  const open = rows.filter(r => r.until === 'null').map(r => `${r.kind}/${r.model}`)
  assert.equal(new Set(open).size, open.length)
})

test('time-limited prices hand over exactly at their end date', () => {
  for (const ending of rows.filter(r => r.until !== 'null')) {
    const next = rows.find(r => r.kind === ending.kind && r.model === ending.model && `'${r.from}'` === ending.until)
    assert.ok(next, `${ending.model} has a follow-on price`)
  }
})

test('seed is idempotent and the priced list honours end dates', () => {
  assert.match(sql, /where not exists \(/)
  assert.match(sql, /effective_until is null or effective_until > now\(\)/)
})
