// saas/tests/honestRefusalReply.node.test.ts
// Production 2026-10-26: the no-answer reply was assembled from keywords in the request and asked the owner for
// "the total power draw, network bandwidth, data volume and unit price" on a request that needed none of them.
// The reply now depends only on the person's language.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildHonestRefusalReply } from '../lib/ai/cos/honestRefusalReply.ts'

const LANGUAGES = ['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar'] as const
const REQUESTS = [
  'An LLM pretraining job across 512 H100s must move to EU-North. Calculate break-even egress cost versus power savings.',
  'Why did GEN-2 fail during the test? Give leading hypotheses.',
  readFileSync(new URL('./fixtures/cos-incident-analysis-brief.txt', import.meta.url), 'utf8'),
  readFileSync(new URL('./fixtures/cos-production-acceptance-campaign.txt', import.meta.url), 'utf8'),
  'hello',
  '',
]

test('the words of the request never change the reply; only the language does', () => {
  for (const language of LANGUAGES) {
    const replies = new Set(REQUESTS.map(prompt => buildHonestRefusalReply({ prompt, language })))
    assert.equal(replies.size, 1, language)
  }
})

test('the reply never invents inputs the person supposedly left out, or a cause', () => {
  const reply = buildHonestRefusalReply({ prompt: REQUESTS[0], language: 'en' })
  assert.doesNotMatch(reply, /power draw|bandwidth|unit price|data volume|readings|baseline|single cause|I need/i)
  assert.match(reply, /not giving you a guessed one/)
  assert.match(reply, /Send it again/)
})

test('no internal vocabulary reaches the public surface, in any language', () => {
  const forbidden = /confidence|threshold|gate|evidence|retriev|fallback|corpus|telemetry|qwen|deepinfra|model|provider|synthesis|independen|harness|builder/i
  for (const language of LANGUAGES) assert.ok(!forbidden.test(buildHonestRefusalReply({ prompt: 'x', language })), language)
})

test('all eleven languages have their own reply, and unknown languages fall back to English', () => {
  const seen = new Set(LANGUAGES.map(language => buildHonestRefusalReply({ prompt: 'x', language })))
  assert.equal(seen.size, 11)
  const english = buildHonestRefusalReply({ prompt: 'x', language: 'en' })
  for (const language of ['xx', null, undefined, 'EN-us']) assert.equal(buildHonestRefusalReply({ prompt: 'x', language }), english, String(language))
})
