import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyAuthoritativeVolatileFact,
  groundAuthoritativeVolatileFact,
  renderAuthoritativeGroundedReply,
} from '../lib/ai/cos/authoritativeFactGrounding.ts'
import { buildCosLiveTelemetry } from '../lib/ai/cos/cosLiveTelemetry.ts'

const USAGOV_BODY = '<main>The 47th and current president of the United States is <strong>Donald John Trump</strong>. He was sworn into office on January 20, 2025.</main>'

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

test('extracts the current president from live government page text without a model', async () => {
  const grounded = await groundAuthoritativeVolatileFact('Who is the current US president?', {
    fetch: fakeFetch({ 'https://www.usa.gov/presidents': { body: USAGOV_BODY } }),
    now: () => Date.parse('2026-08-15T12:00:00.000Z'),
  })
  assert.ok(grounded)
  if (!grounded) return
  assert.equal(grounded.answer, 'The current President of the United States is Donald John Trump.')
  assert.equal(grounded.sourceId, 'usagov_presidents')
  const reply = renderAuthoritativeGroundedReply(grounded)
  assert.match(reply, /Donald John Trump/)
  assert.match(reply, /usa\.gov\/presidents/)
  assert.match(reply, /2026-08-15T12:00:00\.000Z/)
})

test('returns null when the authoritative source is unavailable or no longer exposes the fact', async () => {
  assert.equal(await groundAuthoritativeVolatileFact('Who is the current US president?', {
    fetch: fakeFetch({ 'https://www.usa.gov/presidents': { ok: false, status: 503 } }),
  }), null)
  assert.equal(await groundAuthoritativeVolatileFact('Who is the current US president?', {
    fetch: fakeFetch({ 'https://www.usa.gov/presidents': { body: '<main>Maintenance</main>' } }),
  }), null)
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
