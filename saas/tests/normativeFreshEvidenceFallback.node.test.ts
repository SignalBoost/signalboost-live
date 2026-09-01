import assert from 'node:assert/strict'
import test from 'node:test'
import { buildNormativeFreshEvidenceFallback } from '../lib/ai/cos/normativeFreshEvidenceFallback.ts'

const sources = [
  { id:'LIVE1', title:'Official policy', url:'https://example.gov/policy', snippet:'The governing body states its current eligibility rule and the evidence considered.' },
  { id:'LIVE2', title:'Scientific review', url:'https://example.edu/review', snippet:'The review describes measured outcomes, limitations, and affected populations.' },
]

test('normative timeout recovery returns a cited neutral evidence map instead of a refusal', () => {
  const reply = buildNormativeFreshEvidenceFallback({ input:'should men be allowed to play in women sports?', sources, language:'en' }) || ''
  assert.match(reply, /competing principles/i)
  assert.match(reply, /\[LIVE1\]\(https:\/\/example\.gov\/policy\)/)
  assert.match(reply, /\[LIVE2\]\(https:\/\/example\.edu\/review\)/)
  assert.doesNotMatch(reply, /^\s*(?:yes|no)\b/i)
  assert.doesNotMatch(reply, /did not meet the verification requirement/i)
})

test('fallback is restricted to normative questions with live evidence', () => {
  assert.equal(buildNormativeFreshEvidenceFallback({ input:'What is a database?', sources, language:'en' }), null)
  assert.equal(buildNormativeFreshEvidenceFallback({ input:'Should voting be allowed?', sources:[], language:'en' }), null)
})
