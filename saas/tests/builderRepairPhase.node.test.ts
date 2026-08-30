import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveRepairPhase, formatRepairPhase } from '../lib/builder/repair-phase.ts'
import type { BuilderToolTrace } from '../lib/builder/contracts.ts'

const item = (toolId: BuilderToolTrace['toolId'], ok: boolean, input: Record<string, unknown>): BuilderToolTrace =>
  ({ round: 1, toolId, ok, input })

test('requires inspect then reproduce then repair then verify', () => {
  const initial = new Set(['src/math.js'])
  const inspected = [item('read_file', true, { path: 'src/math.js' })]
  assert.equal(deriveRepairPhase([], initial), 'inspect')
  assert.equal(deriveRepairPhase(inspected, initial), 'reproduce')
  const reproduced = [...inspected, item('run', false, { command: 'node --test tests/math.test.js' })]
  assert.equal(deriveRepairPhase(reproduced, initial), 'repair')
  const repaired = [...reproduced, item('edit_file', true, { path: 'src/math.js' })]
  assert.equal(deriveRepairPhase(repaired, initial), 'verify')
  const verified = [...repaired, item('run', true, { command: 'node --test tests/math.test.js' })]
  assert.equal(deriveRepairPhase(verified, initial), 'complete')
})

test('renders the discovered proof command only when useful', () => {
  assert.match(formatRepairPhase('reproduce', 'npm test'), /npm test/)
  assert.doesNotMatch(formatRepairPhase('repair', 'npm test'), /npm test/)
})
