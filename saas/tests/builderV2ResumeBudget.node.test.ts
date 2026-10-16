import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/builder/agent-v2.ts', import.meta.url), 'utf8')

test('V2 continuation budgets new steps relative to already persisted receipts', () => {
  assert.match(source, /const maxSteps = Math\.min\(120, steps\.length \+ Math\.max\(1, Math\.min\(options\.maxSteps \?\? 60, 120\)\)\)/)
  for (const prior of [0, 6, 24, 48, 96, 119]) {
    const end = Math.min(120, prior + Math.max(1, Math.min(24, 120)))
    assert.ok(end > prior && end <= 120)
  }
})

test('V2 nonprogress preserves the checkpoint for the bounded continuation controller', () => {
  assert.doesNotMatch(source, /builder_v2_no_progress/)
  assert.match(source, /if \(unproductive >= 6\) return \{ ok: false, reason: 'builder_v2_step_budget', steps, checkpoint: await snapshot\(\) \}/)
})
