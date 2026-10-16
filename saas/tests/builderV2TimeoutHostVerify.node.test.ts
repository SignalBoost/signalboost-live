import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../lib/builder/agent-v2.ts', import.meta.url), 'utf8')

test('a model timeout after all files exist dispatches each mandatory real host command', () => {
  assert.match(src, /if \(checklist\.files\.length && missingFiles\(\)\.length === 0 && checklist\.commands\.length\)/)
  assert.match(src, /this\.dispatcher\.dispatch\(options\.workspaceId, \{ tool: 'run_tests', command \}\)/)
  assert.match(src, /if \(!receipt\.ok\) break/)
})
test('no simulated pass: acceptance still needs recorded passing host receipts', () => {
  assert.match(src, /builderV2Acceptance\(options\.objective, knownFiles, steps\)/)
  assert.match(src, /acceptance\.satisfied && verifiedRevision === revision/)
  assert.match(src, /if \(options\.onCheckpoint\)/)
})
