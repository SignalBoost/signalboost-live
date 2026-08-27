// saas/tests/freshVerificationUnavailableReply.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildFreshVerificationUnavailableReply,
  factClassOf,
} from '../lib/ai/cos/freshVerificationUnavailableReply.ts'

const FLIGHTS = 'are there direct flights from Paramaribo to Sao Paulo?'

test('the production question now gets an actionable reply', () => {
  // Previously: "COS retrieved live evidence, but the synthesis did not prove that its current-fact
  // answer was grounded in that evidence. The answer was rejected instead of guessing."
  const reply = buildFreshVerificationUnavailableReply({ prompt: FLIGHTS, language: 'en' })
  assert.match(reply, /could not confirm/i)
  assert.match(reply, /operator's own site|live booking search/i)
  assert.ok(reply.length > 120)
})

test('no internal vocabulary reaches the reader, in any language', () => {
  const forbidden = /synthes|grounded|evidence|retriev|confidence|threshold|gate|rejected|corpus|telemetry|COS\b/i
  for (const language of ['en', 'es', 'pt', 'pl', 'ru']) {
    for (const prompt of [FLIGHTS, 'who is the current CEO of Nike?', 'hello', '']) {
      const reply = buildFreshVerificationUnavailableReply({ prompt, language })
      assert.ok(!forbidden.test(reply), `${language}: ${reply}`)
    }
  }
})

test('the old wording is gone from both routes', () => {
  for (const path of ['app/api/cos-primary/route.ts', 'app/api/cos-primary/baseRoute.ts']) {
    const source = readFileSync(path, 'utf8')
    assert.ok(!/synthesis did not prove/i.test(source), path)
    assert.match(source, /buildFreshVerificationUnavailableReply/, path)
  }
})

test('the question is pointed at a plausible authoritative source', () => {
  assert.equal(factClassOf(FLIGHTS), 'travel')
  assert.equal(factClassOf('how much does it cost now?'), 'price')
  assert.equal(factClassOf('is the museum open today?'), 'hours')
  assert.equal(factClassOf('who is the current CEO of Nike?'), 'role')
  assert.equal(factClassOf('explain photosynthesis'), 'generic')
})

test('the hint is derived from the question only, never from anything retrieved', () => {
  // It cannot leak a source it never saw, and it cannot be wrong about one either.
  const a = buildFreshVerificationUnavailableReply({ prompt: FLIGHTS, language: 'en' })
  const b = buildFreshVerificationUnavailableReply({ prompt: FLIGHTS, language: 'en' })
  assert.equal(a, b, 'the reply must be a pure function of prompt and language')
  assert.ok(!/http/i.test(a), 'no URL may appear')
})

test('all five languages produce distinct, non-empty replies', () => {
  const seen = new Set<string>()
  for (const language of ['en', 'es', 'pt', 'pl', 'ru']) {
    const reply = buildFreshVerificationUnavailableReply({ prompt: FLIGHTS, language })
    assert.ok(reply.trim().length > 100, language)
    seen.add(reply)
  }
  assert.equal(seen.size, 5)
})

test('unknown language falls back to English, and junk input is safe', () => {
  const english = buildFreshVerificationUnavailableReply({ prompt: FLIGHTS, language: 'en' })
  assert.equal(buildFreshVerificationUnavailableReply({ prompt: FLIGHTS, language: 'de' }), english)
  assert.equal(buildFreshVerificationUnavailableReply({ prompt: FLIGHTS, language: null }), english)
  assert.ok(buildFreshVerificationUnavailableReply({}).length > 100)
  assert.ok(buildFreshVerificationUnavailableReply({ prompt: null, language: undefined }).length > 100)
})
