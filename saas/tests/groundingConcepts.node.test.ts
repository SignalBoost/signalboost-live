// saas/tests/groundingConcepts.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { conceptTokens, conceptOf } from '../lib/ai/cos/groundingConcepts.ts'
import { relevanceScore, selectGroundingEvidence } from '../lib/ai/cos/grounding.ts'

// The production question that exposed the defect.
const QUESTION =
  'An LLM pretraining job across 512 H100s migrated from US-East to EU-North. Calculate break-even data egress versus power cost savings ($0.11/kWh vs $0.03/kWh).'

const POWER_DOC =
  'H100 SXM5 TDP 700 W. 8-GPU HGX node wall power ~10-11 kW. 1,024 H100 at node level = 128 nodes x 10 kW = 1,280 kW. Use the node figure for facility and electricity-cost work.'
const LATENCY_DOC =
  'Speed of light in fiber 200,000 km/s. US-East to EU-North round trip latency floor 35-45 ms. Bandwidth delay product bounds throughput on long haul links.'
const COOLING_DOC =
  'Rack inlet temperature ASHRAE A1 recommended 18-27 C. Check blanking panels and containment before suspecting the chiller.'

test('THE GATE: the power document outranks the latency document on a power question', () => {
  // Before concept expansion: power 0.071, latency 0.143 — the latency row won because it
  // happened to contain the two place names from the question. This assertion is the whole
  // reason the module exists; if it fails, the change is not worth shipping.
  const power = relevanceScore(QUESTION, POWER_DOC)
  const latency = relevanceScore(QUESTION, LATENCY_DOC)
  assert.ok(power > latency, `power ${power.toFixed(3)} must exceed latency ${latency.toFixed(3)}`)
})

test('an unrelated document stays lowest — expansion must not match everything to everything', () => {
  const power = relevanceScore(QUESTION, POWER_DOC)
  const latency = relevanceScore(QUESTION, LATENCY_DOC)
  const cooling = relevanceScore(QUESTION, COOLING_DOC)
  assert.ok(cooling < power && cooling < latency, `cooling ${cooling.toFixed(3)} must rank last`)
})

test('the power row is actually selected for injection, not merely scored higher', () => {
  const selected = selectGroundingEvidence(QUESTION, { kg: [], cl: [POWER_DOC, LATENCY_DOC, COOLING_DOC], em: [] }, 2)
  assert.equal(selected[0].text, POWER_DOC)
})

test('vocabulary that means the same quantity maps to one concept', () => {
  for (const [a, b] of [
    ['kwh', 'power'],
    ['kw', 'wattage'],
    ['tdp', 'electricity'],
    ['savings', 'cost'],
    ['payback', 'price'],
    ['rtt', 'latency'],
    ['gbps', 'throughput'],
    ['resharding', 'checkpoint'],
    ['bf16', 'parameters'],
  ] as const) {
    assert.equal(conceptOf(a), conceptOf(b), `${a} and ${b} should share a concept`)
    assert.ok(conceptOf(a), `${a} must have a concept`)
  }
})

test('unrelated domains do NOT share a concept', () => {
  assert.notEqual(conceptOf('power'), conceptOf('latency'))
  assert.notEqual(conceptOf('cooling'), conceptOf('cost'))
  assert.notEqual(conceptOf('checkpoint'), conceptOf('battery'))
  assert.equal(conceptOf('banana'), undefined)
  assert.equal(conceptOf(''), undefined)
})

test('hyphenated compounds reach their concept', () => {
  // Reference material writes "electricity-cost" and "node-level" as single tokens.
  assert.ok(conceptTokens(['electricity-cost']).includes(conceptOf('power') as string))
  assert.ok(conceptTokens(['electricity-cost']).includes(conceptOf('cost') as string))
})

test('a quantity written with its unit attached carries the concept', () => {
  assert.ok(conceptTokens(['700w']).includes(conceptOf('power') as string))
  assert.ok(conceptTokens(['12tb']).includes(conceptOf('storage') as string))
})

test('concepts are deduplicated so repetition cannot inflate a row', () => {
  const many = conceptTokens(['power', 'kw', 'kwh', 'watt', 'tdp', 'electricity'])
  assert.equal(many.length, 1, 'one cluster must yield exactly one token')
})

test('empty and junk input is safe', () => {
  assert.deepEqual(conceptTokens([]), [])
  assert.deepEqual(conceptTokens(['zzz', 'qqq']), [])
  assert.equal(conceptOf(undefined as unknown as string), undefined)
})
