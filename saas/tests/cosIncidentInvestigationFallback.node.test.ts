import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { buildHonestRefusalReply } from '../lib/ai/cos/honestRefusalReply.ts'
import { requestedAnalyticalTasks } from '../lib/ai/cos/answerTaskContract.ts'

const incident = readFileSync(new URL('./fixtures/cos-incident-analysis-brief.txt', import.meta.url), 'utf8')

test('the eight-task incident request is recognized, but model failure cannot become a canned answer', () => {
  assert.equal(requestedAnalyticalTasks(incident).length, 8)
  const answer = buildHonestRefusalReply({ prompt: incident, language: 'en' })
  assert.match(answer, /could not complete the requested analytical deliverables/i)
  assert.match(answer, /root cause is unconfirmed/i)
  assert.doesNotMatch(answer, /Kafka at-least-once replay|Ranked working hypotheses|To answer it properly I need/)
})

test('unseen analytical assignments also fail honestly rather than claiming a completed analysis', () => {
  const prompt = 'Investigate unexpected database growth.\n1. List plausible reasons.\n2. Rank alternatives.\n3. Describe evidence needed.'
  assert.equal(requestedAnalyticalTasks(prompt).length, 3)
  assert.match(buildHonestRefusalReply({ prompt, language: 'en' }), /could not complete the requested analytical deliverables/)
})

test('ordinary narrow diagnosis retains its normal no-proof fallback', () => {
  const reply = buildHonestRefusalReply({ prompt: 'Why did GEN-2 fail during the test? Give leading hypotheses.', language: 'en' })
  assert.match(reply, /readings that separate the candidate causes/)
})
