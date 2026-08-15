import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyAuthoritativeVolatileFact,
  groundAuthoritativeVolatileFact,
  renderAuthoritativeGroundedReply,
} from '../lib/ai/cos/authoritativeFactGrounding.ts'
import { buildCosLiveTelemetry } from '../lib/ai/cos/cosLiveTelemetry.ts'

const USAGOV_BODY = '<main>The 47th and current president of the United States is <strong>Donald John Trump</strong>. He was sworn into office on January 20, 2025.</main>'
const WHITEHOUSE_BODY = '<main><h1>The Administration</h1><h2>President Donald John Trump</h2><p>45th & 47th President of the United States</p></main>'

function fakeFetch(map: Record<string, { ok?: boolean; status?: number; body?: string }>) {
  return async (url: string) => {
    const hit = map[url]
    if (!hit) return { ok: false, status: 404, text: async () => '' }
    return { ok: hit.ok ?? true, status: hit.status ?? 200, text: async () => hit.body ?? '' }
  }
}

test('recognizes present-tense US president questions but not historical ones', () => {
  for (const question of ['Who is the current US president?', 'Who is the president of the United States?', 'current POTUS?']) {
    assert.equal(classifyAuthoritativeVolatileFact(question)?.id, 'us_president')
  }
  for (const question of ['Who was the US president in 1990?', 'previous US president', 'Explain presidential succession']) {
    assert.equal(classifyAuthoritativeVolatileFact(question), null)
  }
})

test('corroborates the current president across White House and USAGov without a model', async () => {
  const grounded = await groundAuthoritativeVolatileFact('Who is the current US president?', {
    fetch: fakeFetch({
      'https://www.whitehouse.gov/administration/': { body: WHITEHOUSE_BODY },
      'https://www.usa.gov/presidents': { body: USAGOV_BODY },
    }),
    now: () => Date.parse('2026-08-15T12:00:00.000Z'),
  })
  assert.ok(grounded)
  if (!grounded) return
  assert.equal(grounded.answer, 'The current President of the United States is Donald John Trump.')
  assert.equal(grounded.sources.length, 2)
  assert.deepEqual(grounded.sources.map(source => source.sourceId), ['whitehouse_administration', 'usagov_presidents'])
  const reply = renderAuthoritativeGroundedReply(grounded)
  assert.match(reply, /Donald John Trump/)
  assert.match(reply, /whitehouse\.gov\/administration/)
  assert.match(reply, /usa\.gov\/presidents/)
  assert.match(reply, /2026-08-15T12:00:00\.000Z/)
})

test('one healthy authoritative source can verify when the other is unavailable', async () => {
  const grounded = await groundAuthoritativeVolatileFact('Who is the current US president?', {
    fetch: fakeFetch({
      'https://www.whitehouse.gov/administration/': { ok: false, status: 503 },
      'https://www.usa.gov/presidents': { body: USAGOV_BODY },
    }),
  })
  assert.ok(grounded)
  assert.equal(grounded?.sources.length, 1)
  assert.equal(grounded?.sources[0]?.sourceId, 'usagov_presidents')
})

test('fails closed when no authoritative source verifies the fact', async () => {
  assert.equal(await groundAuthoritativeVolatileFact('Who is the current US president?', {
    fetch: fakeFetch({
      'https://www.whitehouse.gov/administration/': { ok: false, status: 503 },
      'https://www.usa.gov/presidents': { body: '<main>Maintenance</main>' },
    }),
  }), null)
})

test('fails closed when authoritative sources disagree', async () => {
  const conflictingWhiteHouse = '<main><h1>The Administration</h1><h2>President Jane Example</h2><p>48th President of the United States</p></main>'
  const grounded = await groundAuthoritativeVolatileFact('Who is the current US president?', {
    fetch: fakeFetch({
      'https://www.whitehouse.gov/administration/': { body: conflictingWhiteHouse },
      'https://www.usa.gov/presidents': { body: USAGOV_BODY },
    }),
  })
  assert.equal(grounded, null)
})

test('authoritative direct answers are counted as inference avoided', () => {
  const telemetry = buildCosLiveTelemetry({
    responseSource: 'authoritative_source',
    latencyMs: 25,
    confidence: 1,
    reasonerLabel: null,
    localModelInvoked: false,
    externalAiInvoked: false,
    promptChars: 40,
    replyChars: 120,
  })
  assert.equal(telemetry.inferenceAvoided, true)
  assert.equal(telemetry.localCallsAvoided, 1)
  assert.equal(telemetry.externalCallsAvoided, 1)
})
