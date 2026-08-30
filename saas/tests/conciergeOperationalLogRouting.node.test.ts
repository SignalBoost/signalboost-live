import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('Concierge analyzes a pasted operational log before Builder routing', () => {
  const route = readFileSync(new URL('../app/api/concierge/route.ts', import.meta.url), 'utf8')
  const guard = route.indexOf('isPastedOperationalLog(objective)')
  const builder = route.indexOf('isConciergeBuilderObjective(objective)', guard)
  assert.ok(guard >= 0)
  assert.ok(builder > guard)
  assert.match(route, /concierge-operational-log-analysis/)
})
