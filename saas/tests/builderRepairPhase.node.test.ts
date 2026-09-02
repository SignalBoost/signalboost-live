import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveRepairPhase, formatRepairPhase } from '../lib/builder/repair-phase.ts'
import type { BuilderToolTrace } from '../lib/builder/contracts.ts'

const item = (
  toolId: BuilderToolTrace['toolId'],
  ok: boolean,
  input: Record<string, unknown>,
  extra: Partial<BuilderToolTrace> = {},
): BuilderToolTrace => ({ round: 1, toolId, ok, input, ...extra })

test('requires inspect then reproduce then repair then verify', () => {
  const initial = new Set(['src/math.js'])
  const inspected = [item('read_file', true, { path: 'src/math.js' })]
  assert.equal(deriveRepairPhase([], initial), 'inspect')
  assert.equal(deriveRepairPhase(inspected, initial), 'reproduce')
  const reproduced = [...inspected, item('run', false, { command: 'node --test tests/math.test.js' }, { failureClass: 'test' })]
  assert.equal(deriveRepairPhase(reproduced, initial), 'repair')
  const repaired = [...reproduced, item('edit_file', true, { path: 'src/math.js' })]
  assert.equal(deriveRepairPhase(repaired, initial), 'verify')
  const verified = [...repaired, item('run', true, { command: 'node --test tests/math.test.js' })]
  assert.equal(deriveRepairPhase(verified, initial), 'complete')
})

test('runtime, path, storage and dependency failures do not masquerade as a reproduced source defect', () => {
  const initial = new Set(['src/math.js'])
  const inspected = item('read_file', true, { path: 'src/math.js' })
  for (const failureClass of ['runtime', 'path', 'storage', 'dependency'] as const) {
    const trace = [
      inspected,
      item('run', false, { command: 'npm test' }, { failureClass, error: 'builder_command_failed: exit 137' }),
    ]
    assert.equal(deriveRepairPhase(trace, initial), 'reproduce')
  }
})

test('renders the discovered proof command only when useful', () => {
  assert.match(formatRepairPhase('reproduce', 'npm test'), /npm test/)
  assert.doesNotMatch(formatRepairPhase('repair', 'npm test'), /npm test/)
})
