import assert from 'node:assert/strict'
import test from 'node:test'
import {
  answerFreshnessSignals,
  answerNeedsFreshnessReflection,
  stripUnsupportedCurrentClaimSentences,
} from '../lib/ai/cos/answerFreshnessSelfReflection.ts'

const CEO_OVERREACH = `The goal is to prove that the current resource allocation is mathematically incompatible with the company's survival timeline. I believe we've extracted the key technical insights we needed. In 8 months, a 4% monthly churn rate reduces your user base by approximately 28% compounded. We have 8 months to prove product-market fit or pivot. Every week spent on Web3/AR is a week we are bleeding users to competitors. Even if churn drops to 2%, the company retains significantly more revenue and extends effective runway. The risk is likely leading to insolvency.`

test('the observed CEO resource-allocation overreach triggers answer-side repair', () => {
  assert.equal(answerNeedsFreshnessReflection(CEO_OVERREACH), true)
  const signals = answerFreshnessSignals(CEO_OVERREACH).filter(signal => signal.code === 'unsupported_scenario_inference')
  assert.ok(signals.length >= 5)
  const text = signals.map(signal => signal.excerpt).join(' ')
  assert.match(text, /survival timeline/i)
  assert.match(text, /technical insights/i)
  assert.match(text, /product-market fit/i)
  assert.match(text, /competitors/i)
  assert.match(text, /runway/i)
  assert.match(text, /insolvency/i)
})

test('churn compounding is allowed only as an explicitly modelled illustration', () => {
  const unsafe = 'In 8 months, a 4% monthly churn rate reduces the user base by approximately 28%.'
  const safe = 'If 4% monthly churn applied to a fixed cohort with no offsetting acquisition for 8 months, that cohort would decline by about 28%; this is an illustrative scenario, not a forecast of total users, revenue, or runway.'
  assert.equal(answerNeedsFreshnessReflection(unsafe), true)
  assert.equal(answerNeedsFreshnessReflection(safe), false)
})

test('an if-clause does not validate an unsupported revenue or runway consequence', () => {
  const unsafe = 'Even if churn falls to 2%, the company retains significantly more revenue and extends effective runway.'
  const safe = 'If churn falls to 2%, retention would improve; the revenue and runway effect could be estimated separately and depends on pricing, acquisition, and burn.'
  assert.equal(answerNeedsFreshnessReflection(unsafe), true)
  assert.equal(answerNeedsFreshnessReflection(safe), false)
})

test('proposal language is not confused with an asserted company commitment', () => {
  const safe = 'Propose a four-week blocker sprint, then review measured churn before deciding whether to restore the Web3/AR allocation.'
  assert.equal(answerNeedsFreshnessReflection(safe), false)
})

test('deterministic fallback preserves governance while removing invented strategic facts', () => {
  const answer = `Use a reversible two-to-four-week reallocation with explicit review gates. ${CEO_OVERREACH} Preserve the prototype and define evidence-based conditions for restoring research capacity.`
  const stripped = stripUnsupportedCurrentClaimSentences(answer)
  assert.match(stripped, /reversible two-to-four-week reallocation/i)
  assert.match(stripped, /restoring research capacity/i)
  assert.doesNotMatch(stripped, /survival timeline/i)
  assert.doesNotMatch(stripped, /competitors/i)
  assert.doesNotMatch(stripped, /retains significantly more revenue/i)
  assert.doesNotMatch(stripped, /insolvency/i)
})
