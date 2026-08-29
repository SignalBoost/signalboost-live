import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  freshFailureReply,
  publicFreshFailureCode,
} from '../lib/ai/cos/freshEvidenceFailureRecovery.ts'

test('transport failure after authoritative research is a temporary error, never a verification-unavailable refusal', () => {
  const reply = freshFailureReply('local_synthesis_failed', 'en') || ''
  assert.match(reply, /temporary processing error/i)
  assert.match(reply, /sources were saved/i)
  assert.doesNotMatch(reply, /could not confirm/i)
  assert.equal(publicFreshFailureCode('local_synthesis_failed'), 'local_synthesis_failed')
})

test('completed but ungrounded fresh synthesis fails closed on the claim while retaining the research category', () => {
  const reply = freshFailureReply('citation_grounding_rejected', 'en') || ''
  assert.match(reply, /did not meet the verification requirement/i)
  assert.match(reply, /not making the claim/i)
  assert.equal(publicFreshFailureCode('citation_grounding_rejected'), 'ungrounded_synthesis')
  assert.equal(publicFreshFailureCode('local_synthesis_unparseable'), 'ungrounded_synthesis')
})

test('only insufficient authority delegates to the verification-unavailable copy', () => {
  assert.equal(freshFailureReply('insufficient_live_authority', 'en'), null)
})

test('COS primary retains evidence and emits a distinct public failure code for every fresh failure path', () => {
  const route = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
  assert.match(route, /fresh_failure_class:'insufficient_live_authority'/)
  assert.match(route, /fresh_failure_class:freshFailureCode/)
  assert.match(route, /live_evidence_sources:requiresFreshEvidence\?freshSources\.map/)
  assert.match(route, /freshFailureReply\(freshFailureCode!,language\)/)
  assert.doesNotMatch(route, /freshSynthesisRejectedReply/)
})

test('Concierge returns classified fresh 503s instead of replacing them with a generic outage reply', () => {
  const route = readFileSync(new URL('../app/api/concierge/route.ts', import.meta.url), 'utf8')
  assert.match(route, /primarySnapshot\.freshFailureClass/)
  assert.match(route, /'local_synthesis_failed'/)
  assert.match(route, /return primary/)
})
