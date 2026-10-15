import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const loop = readFileSync(new URL('../lib/builder/tool-loop.ts', import.meta.url), 'utf8')

test('a repeated inspection without a reproduced failure does not require speculative mutation', () => {
  assert.match(loop, /const repeatedRepairStall = repairObjective && latestFailedRunIndex < 0/)
  assert.match(loop, /no failing verification command has reproduced the defect/)
  assert.match(loop, /Run a targeted reproducing test or verification command/)
  assert.match(loop, /\.filter\(toolId => !repairMutationRequired \|\| toolId === 'write_file' \|\| toolId === 'edit_file'\)/)
  assert.doesNotMatch(loop, /repairMutationRequired \|\| repeatedRepairStall/)
  assert.doesNotMatch(loop, /repairMutationRequired \|\| \(repeatedRepairStall && !passingProofBeforeChange\)/)
})
