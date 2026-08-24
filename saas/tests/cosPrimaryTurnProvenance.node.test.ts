import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const route=readFileSync(new URL('../app/api/cos-primary/route.ts',import.meta.url),'utf8')
const store=readFileSync(new URL('../lib/ai/cos/cosPrimaryTurnProvenance.ts',import.meta.url),'utf8')

test('cos-primary reads and writes durable prior-turn provenance',()=>{
  assert.match(route,/readCosPrimaryPriorProvenance/)
  assert.match(route,/writeCosPrimaryProvenance/)
  assert.match(route,/formatAuthoritativeProvenance/)
  assert.doesNotMatch(route,/This route does not retain a real prior turn to consult/)
})

test('prior-turn lookup binds rendered assistant text through canonical content matching',()=>{
  assert.match(store,/assistantContentMatchesForProvenance/)
  assert.match(store,/assistantContentMatchesForProvenance\(data\.assistant_content,precedingAssistant\)/)
})
