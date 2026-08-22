import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { isLocalPlaceDiscoveryQuery, resolveLocalPlaceDiscovery } from '../lib/ai/cos/cosLocalDiscovery.ts'

test('local place discovery recognizes the exact Paramaribo salsa query', () => {
  assert.equal(isLocalPlaceDiscoveryQuery('are there salsa clubs in Paramaribo?'), true)
  assert.equal(isLocalPlaceDiscoveryQuery('find restaurants near Warsaw Old Town'), true)
  assert.equal(isLocalPlaceDiscoveryQuery('show me hotels in Asuncion'), true)
})

test('local place discovery does not hijack non-place factual or conceptual questions', () => {
  assert.equal(isLocalPlaceDiscoveryQuery('Are there volcanoes in Iceland?'), false)
  assert.equal(isLocalPlaceDiscoveryQuery('Explain how salsa dancing works'), false)
  assert.equal(isLocalPlaceDiscoveryQuery('What is the capital of Suriname?'), false)
})

test('local place discovery answers only from relevant live result text with server-owned citations', () => {
  const sources = [
    {
      id: 'LIVE1',
      title: 'Dansclub DanzSon Paramaribo',
      url: 'https://example.com/danzson',
      snippet: 'Salsa, bachata and kizomba lessons and socials in Paramaribo.',
    },
    {
      id: 'LIVE2',
      title: 'Salsa By Cedric',
      url: 'https://example.org/salsa-cedric',
      snippet: 'Salsa classes and Latin social nights at several locations in Paramaribo.',
    },
    {
      id: 'LIVE3',
      title: 'Unrelated Manila nightlife',
      url: 'https://irrelevant.example/manila',
      snippet: 'Nightlife guide for Manila in the Philippines.',
    },
  ]

  const resolved = resolveLocalPlaceDiscovery('are there salsa clubs in Paramaribo?', sources, 'en')
  assert.ok(resolved)
  assert.match(resolved.reply, /^Yes\./)
  assert.match(resolved.reply, /Dansclub DanzSon Paramaribo/)
  assert.match(resolved.reply, /Salsa By Cedric/)
  assert.match(resolved.reply, /\[LIVE1\] \(https:\/\/example\.com\/danzson\)/)
  assert.match(resolved.reply, /\[LIVE2\] \(https:\/\/example\.org\/salsa-cedric\)/)
  assert.doesNotMatch(resolved.reply, /Manila nightlife/)
})

test('fresh synthesis is COS-first: deterministic discovery, then local reasoner, then external fallback', () => {
  const source = readFileSync(new URL('../lib/ai/cos/freshEvidenceExternalSynthesis.ts', import.meta.url), 'utf8')
  const deterministic = source.indexOf('resolveLocalPlaceDiscovery(')
  const local = source.indexOf('await callCosReasoner(')
  const external = source.indexOf('await callCosTextDetailed(')
  assert.ok(deterministic >= 0)
  assert.ok(local > deterministic)
  assert.ok(external > local)
  assert.match(source, /source: 'deterministic'/)
  assert.match(source, /source: 'local'/)
})
