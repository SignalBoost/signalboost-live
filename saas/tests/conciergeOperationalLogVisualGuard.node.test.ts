import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('pasted operational logs cannot route into artifact or visual tools', () => {
  const route = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  assert.ok(route.includes('if (!pastedOperationalLog && isConciergeArtifactObjective(prompt))'))
  assert.ok(route.includes('if (!pastedOperationalLog && isConciergeVisualObjective(prompt))'))
})
