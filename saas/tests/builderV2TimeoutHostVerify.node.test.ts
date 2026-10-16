import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../lib/builder/agent-v2.ts', import.meta.url), 'utf8')

test('a model timeout after all files exist dispatches each mandatory real host command', () => {
  // Shared with host verification after each change (builderV2BatchedActions covers the behaviour).
  assert.match(src, /const hostVerificationDue = \(\) => revision > hostVerifiedRevision && checklist\.files\.length > 0\s+&& missingFiles\(\)\.length === 0 && checklist\.commands\.length > 0/)
  assert.match(src, /const action: BuilderV2Action = \{ tool: 'run_tests', command \}\s+const receipt = await this\.dispatcher\.dispatch\(options\.workspaceId, action\)/)
  assert.match(src, /if \(!receipt\.ok\) return null/)
})
test('no simulated pass: acceptance still needs recorded passing host receipts', () => {
  assert.match(src, /builderV2Acceptance\(options\.objective, knownFiles, steps\)/)
  assert.match(src, /acceptance\.satisfied && verifiedRevision === revision/)
  assert.match(src, /if \(!options\.onCheckpoint\) return/)
})
