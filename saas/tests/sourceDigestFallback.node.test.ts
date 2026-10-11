import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildSourceDigestFallback, buildSourceSummaryFallback } from '../lib/ai/cos/sourceDigestFallback.ts'

test('failed synthesis produces source-only links for relevant search results', () => {
  const digest = buildSourceDigestFallback({
    input: 'where can I dance salsa in Asuncion?',
    language: 'en',
    sources: [
      { id: 'LIVE1', title: 'Salsa events in Asuncion', url: 'https://example.org/salsa', snippet: 'Asuncion has salsa dance events on selected evenings.' },
      { id: 'LIVE2', title: 'Unrelated US university', url: 'https://example.edu/', snippet: 'Academic offerings in Massachusetts.' },
    ],
  })
  assert.match(digest || '', /Salsa events in Asuncion/)
  assert.doesNotMatch(digest || '', /Unrelated US university/)
  assert.match(digest || '', /not a verified conclusion/i)
})

test('no overlap or no safe links leaves the original failure handling intact', () => {
  assert.equal(buildSourceDigestFallback({input:'Salsa dancing Asuncion',language:'en',sources:[{id:'LIVE1',title:'A physics paper',url:'https://example.edu/physics',snippet:'Quantum information and optics'}]}),null)
  assert.equal(buildSourceDigestFallback({input:'Salsa dancing Asuncion',language:'en',sources:[{id:'LIVE1',title:'Salsa club',url:'javascript:alert(1)',snippet:'A salsa event'}]}),null)
})

test('source digest remains a distinct, low-confidence partial result after failed synthesis', () => {
  const route = readFileSync(new URL('../app/api/cos-primary/route.ts',import.meta.url),'utf8')
  assert.match(route, /const sourceDigestFallback=freshHardFail/)
  assert.match(route, /sourceDigestFallback\?0:partialCompletion/)
  assert.match(route, /cos-fresh-source-digest/)
  assert.match(route, /diagnostics:ownerDiagnostics/)
})

test('source digest decodes HTML entities and removes navigation boilerplate', () => {
  const result = buildSourceDigestFallback({
    input: 'salsa dance clubs in Asuncion', language: 'en',
    sources: [{id:'LIVE3',title:'Salsa &#038; dance clubs',url:'https://example.org/salsa',snippet:'Salsa & dance clubs Skip to content Subscribe Menu. Salsa dance sessions are hosted each Friday evening in Asuncion with a local instructor.'}],
  })
  assert.match(result || '', /Salsa & dance clubs/)
  assert.doesNotMatch(result || '', /Skip to content|Subscribe Menu/)
  assert.match(result || '', /https:\/\/example.org\/salsa/)
})

test('source summary reports excerpts with linked attribution, not fabricated synthesis', () => {
 const summary=buildSourceSummaryFallback('salsa venues in Asuncion',[{id:'LIVE1',title:'Asuncion salsa venues',url:'https://example.org/venues',snippet:'Local organizers list salsa social dance events on selected Fridays in Asuncion.'}]);
 assert.match(summary || '', /Asuncion salsa venues.*Read source/s)
 assert.match(summary || '', /selected Fridays/)
 assert.doesNotMatch(summary || '', /confirmed nightclub/i)
})
