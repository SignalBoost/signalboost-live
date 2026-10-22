import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('reproduced failures enter bounded mutation-only recovery before inspection termination', () => {
  const source = readFileSync(new URL('../lib/builder/tool-loop.ts', import.meta.url), 'utf8')
  assert.match(source, /const inspectionLimit = repairObjective && latestFailedRunIndex >= 0 \? 8 : 4/)
  assert.match(source, /if \(!missingBuildDeliverables && deniedInspections >= inspectionLimit\)/)
  assert.match(source, /\.filter\(toolId => !repairMutationRequired \|\| toolId === 'write_file' \|\| toolId === 'edit_file'\)/)
  assert.match(source, /mutation-only recovery exhausted/)
})
