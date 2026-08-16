import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const route = readFileSync(join(here, '../app/api/cos-primary/route.ts'), 'utf8')

test('fresh facts do not re-enter generic COS after live synthesis attempt', () => {
  assert.match(route, /if\(!requestedAction&&!requiresFreshEvidence\)/)
})

test('fresh external fallback bypasses legacy Concierge recursion', () => {
  const freshFallbackStart = route.indexOf('if(requiresFreshEvidence&&freshRetrievedAt)')
  const legacyStart = route.indexOf('// Non-volatile requests retain the existing legacy provider/tool fallback path.')
  assert.ok(freshFallbackStart >= 0)
  assert.ok(legacyStart > freshFallbackStart)
  const freshFallbackBlock = route.slice(freshFallbackStart, legacyStart)
  assert.match(freshFallbackBlock, /synthesizeFreshEvidenceExternally/)
  assert.doesNotMatch(freshFallbackBlock, /legacyConciergePost/)
})

test('fresh live search explicitly bypasses transport cache', () => {
  assert.match(route, /getExternalInfo\(query,8,\{bypassCache:true\}\)/)
})
