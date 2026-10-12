import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const panel = readFileSync(new URL('../app/dashboard/cos-university-telemetry/LabCustomerTrainingPanel.tsx', import.meta.url), 'utf8')

test('LAB provider and compute dropdowns are legible on dark surfaces', () => {
  const selects = panel.match(/<select\b[\s\S]*?<\/select>/g) || []
  assert.ok(selects.length >= 4)
  for (const select of selects) {
    assert.match(select, /bg-slate-900/)
    assert.match(select, /text-white/)
    assert.match(select, /<option/)
  }
})
test('a missing provider catalog cannot enable Save key', () => {
  assert.match(panel, /catalog\.length === 0/)
  assert.match(panel, /!catalog\.some\(item => item\.kind === keyKind\)/)
})
