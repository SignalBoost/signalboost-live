import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('pasted operational logs cannot route into artifact or visual tools', () => {
  const route = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  const guard = route.indexOf('if (!pastedOperationalLog) {')
  const artifact = route.indexOf('if (isConciergeArtifactObjective(prompt))', guard)
  const visual = route.indexOf('if (isConciergeVisualObjective(prompt))', artifact)
  const provenance = route.indexOf('if (isProvenanceIntrospection(prompt))', visual)
  assert.ok(guard >= 0)
  assert.ok(artifact > guard)
  assert.ok(visual > artifact)
  assert.ok(provenance > visual)
})
