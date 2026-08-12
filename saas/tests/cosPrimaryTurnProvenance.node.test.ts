import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const route=readFileSync(new URL('../app/api/cos-primary/route.ts',import.meta.url),'utf8')

test('cos-primary reads and writes durable prior-turn provenance',()=>{
  assert.match(route,/readCosPrimaryPriorProvenance/)
  assert.match(route,/writeCosPrimaryProvenance/)
  assert.match(route,/formatAuthoritativeProvenance/)
  assert.doesNotMatch(route,/This route does not retain a real prior turn to consult/)
})
