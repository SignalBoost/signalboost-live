import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/ai/cos/durableCosTurn.ts', import.meta.url), 'utf8')
test('durable COS completion requires one confirmed conditional persisted transition', () => {
  const start = source.indexOf('export async function finishDurableCosTurn')
  const end = source.indexOf('export async function expireStaleDurableCosTurns', start)
  assert.ok(start >= 0 && end > start)
  const finish = source.slice(start, end)
  assert.match(finish, /\.eq\('provenance->>turnId', input\.turnId\)/)
  assert.match(finish, /\.eq\('provenance->>status', 'running'\)/)
  assert.match(finish, /\.select\('id'\)\s*\.maybeSingle\(\)/)
  assert.match(finish, /persisted\?\.id !== input\.historyMessageId/)
  assert.match(finish, /cos_turn_finish_not_committed/)
})
