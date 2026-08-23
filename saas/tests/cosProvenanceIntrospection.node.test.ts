import assert from 'node:assert/strict'
import test from 'node:test'
import { isProvenanceIntrospection } from '../lib/ai/cos/provenanceIntrospection.ts'

test('plain-language source follow-ups identify prior-answer provenance', () => {
  assert.equal(isProvenanceIntrospection('Show me where from you got the answer for the question?'), true)
  assert.equal(isProvenanceIntrospection('Where did you get that answer from?'), true)
  assert.equal(isProvenanceIntrospection('What sources did you use for your previous response?'), true)
})

test('ordinary factual questions remain outside provenance routing', () => {
  assert.equal(isProvenanceIntrospection('Where is the company headquartered?'), false)
  assert.equal(isProvenanceIntrospection('What are the current sources of inflation?'), false)
})
