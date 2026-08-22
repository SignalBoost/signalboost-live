import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  answerFreshnessSignals,
  answerNeedsFreshnessReflection,
  stripUnsupportedCurrentClaimSentences,
} from '../lib/ai/cos/answerFreshnessSelfReflection.ts'

const AV_DRAFT = `This is a classic ethical dilemma. However, current industry standards, legal frameworks, and engineering priorities generally follow these principles: Most autonomous vehicle manufacturers and regulatory bodies prioritize the safety of the vehicle's occupants. In summary, the prevailing approach in current AV development is to prioritize the safety of the passenger.`

test('answer-side guard catches mutable claims introduced by a normative autonomous-car answer', () => {
  assert.equal(answerNeedsFreshnessReflection(AV_DRAFT), true)
  const codes = new Set(answerFreshnessSignals(AV_DRAFT).map(signal => signal.code))
  assert.equal(codes.has('explicit_current_marker'), true)
  assert.equal(codes.has('mutable_institutional_claim'), true)
  assert.equal(codes.has('prevailing_assertion'), true)
})

test('timeless ethical reasoning is not treated as a current-world factual claim', () => {
  const answer = 'A utilitarian argument favors minimizing total harm, while a rights-based argument warns against intentionally redirecting lethal harm toward an innocent passenger. The dilemma has no uniquely compelled answer without specifying the governing ethical rule.'
  assert.equal(answerNeedsFreshnessReflection(answer), false)
})

test('deterministic fallback removes unsupported current-practice sentences without inventing replacements', () => {
  const answer = 'A utilitarian view would minimize total expected harm. Current industry standards generally prioritize passenger safety. A deontological view may reject intentionally redirecting lethal harm toward an innocent person.'
  const stripped = stripUnsupportedCurrentClaimSentences(answer)
  assert.match(stripped, /utilitarian view/i)
  assert.match(stripped, /deontological view/i)
  assert.doesNotMatch(stripped, /current industry standards/i)
})

test('ordinary COS answers are freshness-reflected before turn learning and release', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosFirstAnswer.ts', import.meta.url), 'utf8')
  assert.match(source, /async function reflectOrdinaryAnswerFreshness/)
  assert.match(source, /answerFreshnessSignals\(result\.reply\)/)
  assert.match(source, /await callCosReasoner\(/)
  assert.match(source, /stripUnsupportedCurrentClaimSentences\(result\.reply\)/)
  assert.match(source, /learnFromTurn\(input, await reflectOrdinaryAnswerFreshness\(input, result\)\)/)
})
