import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('Builder analyzes a pasted operational log before objective validation', () => {
  const route = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')
  const guard = route.indexOf('isPastedOperationalLog(rawObjective)')
  const validation = route.indexOf('cleanObjective(rawObjective)', guard)
  assert.ok(guard >= 0)
  assert.ok(validation > guard)
  assert.match(route, /builder-operational-log-analysis/)
})
