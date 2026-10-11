import test from 'node:test'
import assert from 'node:assert/strict'
import { acceptFreshEvidenceGroundedAnswer } from '../lib/ai/cos/freshEvidenceGroundedAnswer.ts'

const sources = [
  { id: 'LIVE1', title: 'Official chamber breakdown', url: 'https://pressgallery.house.gov/member-data/party-breakdown', snippet: 'Party breakdown' },
  { id: 'LIVE2', title: 'Senate party division', url: 'https://www.senate.gov/history/partydiv.htm', snippet: 'Party division' },
]

test('COS never publishes exposed step-by-step evidence analysis even when citations are present', () => {
  const draft = 'Let me carefully analyze the question and the provided evidence. The question asks which party will be the majority. [LIVE1] - This appears to be a page about the House. [LIVE2] - The snippet mentions party division.'
  const result = acceptFreshEvidenceGroundedAnswer({ text: draft, input: 'Which political party will be the majority in the US?', sources })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'citation_requirement_unmet')
})

test('COS rejects evidence-corpus commentary despite legitimate inline citations', () => {
  const draft = 'The provided evidence does not include any polling data. [LIVE1] [LIVE2]'
  const result = acceptFreshEvidenceGroundedAnswer({ text: draft, input: 'Who is likely to be the next president?', sources })
  assert.equal(result.ok, false)
})

test('COS still permits a direct concise factual reply with grounded citations', () => {
  const draft = 'The House and Senate are separate chambers with different party breakdowns. [LIVE1] [LIVE2]'
  const result = acceptFreshEvidenceGroundedAnswer({ text: draft, input: 'Which political party holds the majority in Congress?', sources })
  assert.equal(result.ok, true)
})
