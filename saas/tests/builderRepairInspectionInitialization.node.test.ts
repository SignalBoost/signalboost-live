import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('repair inspection ceiling cannot access the failing-run index before initialization', () => {
  const source = readFileSync(new URL('../lib/builder/tool-loop.ts', import.meta.url), 'utf8')
  const declaration = source.indexOf('const latestFailedRunIndex = trace.reduce(')
  const use = source.indexOf('const inspectionLimit = repairObjective && latestFailedRunIndex >= 0')
  assert.ok(declaration >= 0, 'a failed host-run index is computed')
  assert.ok(use > declaration, 'the failed host-run index is initialized before the inspection ceiling')
})
