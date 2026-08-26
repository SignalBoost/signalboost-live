// saas/tests/honestRefusalReply.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildHonestRefusalReply, missingInputKeys } from '../lib/ai/cos/honestRefusalReply.ts'

const MIGRATION = 'An LLM pretraining job running across 512 H100s needs to be migrated from US-East to EU-North to take advantage of zero-marginal-cost hydro curtailment. Calculate the break-even data egress and network checkpoint synchronization overhead versus power cost savings ($0.11/kWh vs $0.03/kWh), and define the exact state-checkpoint consistency protocol needed to prevent gradient loss.'

test('the recorded production failure now names what it needs', () => {
  const reply = buildHonestRefusalReply({ prompt: MIGRATION, language: 'en' })
  // Training duration and bandwidth were the genuinely absent inputs.
  assert.match(reply, /time period/)
  assert.match(reply, /bandwidth/)
  assert.ok(reply.length > 80)
})

test('never names an input the prompt already supplied', () => {
  // $0.11/kWh is present, so unit price must not be requested.
  assert.ok(!missingInputKeys(MIGRATION).includes('unitPrice'))
  // 512 H100s carries no kW figure, so power is genuinely absent.
  assert.ok(missingInputKeys(MIGRATION).includes('power'))

  const withEverything = 'Over 1000 hours, a 1280 kW cluster moves 12 TB per checkpoint every 6 hours at $0.04 per GB over a 100 Gbps link. Calculate the break-even cost.'
  assert.deepEqual(missingInputKeys(withEverything), [])
})

test('a fully specified prompt falls back to the generic offer, not a false list', () => {
  const reply = buildHonestRefusalReply({
    prompt: 'Over 1000 hours a 1280 kW cluster moves 12 TB every 6 hours at $0.04 per GB over a 100 Gbps link. Break-even cost?',
    language: 'en',
  })
  assert.match(reply, /narrow the question/)
  assert.ok(!/I need\b/.test(reply))
})

test('diagnostic prompts ask for readings and baselines, not prices', () => {
  const keys = missingInputKeys('During a scheduled generator test, GEN-2 did not start. The controller records a starter-related fault. Give the leading hypotheses and the next safe diagnostic checks.')
  assert.ok(keys.includes('measurements'))
  assert.ok(!keys.includes('unitPrice'))
})

test('no internal vocabulary reaches the public surface', () => {
  const forbidden = /confidence|threshold|gate|evidence|retriev|fallback|corpus|telemetry|qwen|deepinfra|model|provider|synthesis|independen/i
  for (const language of ['en', 'es', 'pt', 'pl', 'ru']) {
    for (const prompt of [MIGRATION, 'why did the switch fail?', 'hello']) {
      const reply = buildHonestRefusalReply({ prompt, language })
      assert.ok(!forbidden.test(reply), `${language}: ${reply}`)
    }
  }
})

test('the dead-end phrasing is gone', () => {
  const reply = buildHonestRefusalReply({ prompt: MIGRATION, language: 'en' })
  assert.ok(!/could not complete this request/i.test(reply))
  assert.ok(!/external AI/i.test(reply))
})

test('all five languages produce distinct non-empty replies', () => {
  const seen = new Set<string>()
  for (const language of ['en', 'es', 'pt', 'pl', 'ru']) {
    const reply = buildHonestRefusalReply({ prompt: MIGRATION, language })
    assert.ok(reply.trim().length > 60, language)
    seen.add(reply)
  }
  assert.equal(seen.size, 5)
})

test('unknown or missing language falls back to English', () => {
  const expected = buildHonestRefusalReply({ prompt: MIGRATION, language: 'en' })
  assert.equal(buildHonestRefusalReply({ prompt: MIGRATION, language: 'de' }), expected)
  assert.equal(buildHonestRefusalReply({ prompt: MIGRATION, language: null }), expected)
  assert.equal(buildHonestRefusalReply({ prompt: MIGRATION }), expected)
})

test('empty and junk prompts are safe', () => {
  assert.deepEqual(missingInputKeys(''), [])
  assert.deepEqual(missingInputKeys('   '), [])
  assert.ok(buildHonestRefusalReply({ prompt: '', language: 'en' }).length > 40)
  assert.ok(buildHonestRefusalReply({ prompt: undefined as unknown as string }).length > 40)
})

test('at most four inputs are named, so the reply stays short', () => {
  const keys = missingInputKeys('Calculate the break-even cost and sizing for this migration.')
  assert.ok(keys.length <= 4)
})
