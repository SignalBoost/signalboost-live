import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')

test('idle watchdog preserves an underlying reason without exposing model/source receipts', () => {
  const block = source.slice(source.indexOf("if (idleSlices >= 3) {"), source.indexOf('const checkpoint: BuilderV2Checkpoint = { ...current, idleSlices }'))
  assert.ok(block.includes("const reason = 'builder_v2_continuation_no_progress'"))
  assert.ok(block.includes('const underlyingReason = cycle.result.reason'))
  assert.ok(block.includes('stallDiagnostic'))
  assert.ok(block.includes('newToolReceipts: current.steps.length - (previous?.steps.length ?? 0)'))
  assert.ok(block.includes('revisionChanged: current.revision > (previous?.revision ?? 0)'))
  assert.ok(block.includes("status: 'failed', reply, error: reason"))
  assert.ok(block.includes('receipts: cycle.result.steps, stallDiagnostic'))
  assert.doesNotMatch(block, /lastReceipt|cycle\.result\.summary/)
  assert.ok(block.includes('if (idleSlices >= 3)'))
})
