import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/builder/agent-v2.ts', import.meta.url), 'utf8')

test('V2 continuation budgets new steps relative to already persisted receipts', () => {
  // Each run counts model calls from zero against maxSteps; the whole job is bounded by BUILDER_V2_MAX_RECEIPTS.
  assert.match(source, /for \(let calls = 0; calls < maxSteps && steps\.length < BUILDER_V2_MAX_RECEIPTS; calls\+\+\)/)
  // Behavioural coverage: builderV2SliceProgress 'a resumed job gets a fresh slice budget ...'.
})

test('V2 nonprogress preserves the checkpoint for the bounded continuation controller', () => {
  assert.doesNotMatch(source, /builder_v2_no_progress/)
  assert.match(source, /if \(unproductive >= BUILDER_V2_STALL_LIMIT\) return \{ ok: false, reason: 'builder_v2_step_budget', steps, checkpoint: await snapshot\(\) \}/)
  assert.match(source, /if \(\+\+repeats >= REPEAT_LIMIT\) return \{ ok: false, reason: 'builder_v2_step_budget', steps, checkpoint: await snapshot\(\) \}/)
})
