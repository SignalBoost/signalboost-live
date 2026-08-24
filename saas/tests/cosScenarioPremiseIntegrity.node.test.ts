import assert from 'node:assert/strict'
import test from 'node:test'
import {
  answerFreshnessSignals,
  answerNeedsFreshnessReflection,
  promptNeedsScenarioPremiseReview,
  stripUnsupportedCurrentClaimSentences,
} from '../lib/ai/cos/answerFreshnessSelfReflection.ts'

const CEO_OVERREACH = `The goal is to prove that the current resource allocation is mathematically incompatible with the company's survival timeline. I believe we've extracted the key technical insights we needed. In 8 months, a 4% monthly churn rate reduces your user base by approximately 28% compounded. We have 8 months to prove product-market fit or pivot. Every week spent on Web3/AR is a week we are bleeding users to competitors. Even if churn drops to 2%, the company retains significantly more revenue and extends effective runway. The risk is likely leading to insolvency.`

const CEO_OVERREACH_V2 = `To construct this feedback without alienating the CEO, you must frame the resource reallocation not as a rejection of innovation, but as a necessary defense of the company’s survival and runway. The core mechanism is Runway-Adjusted Risk Balancing: you are trading a low-probability, high-cost speculative bet for a high-probability, high-impact retention fix. At 4% monthly churn, the user base halves in roughly 17-18 months. With only 8 months of runway, the company is likely to run out of cash before the churn is stabilized. Result: You will lose ~27.4% of your user base in 8 months. This directly reduces revenue and extends the time to profitability or next funding round, effectively burning through the remaining runway faster. Their potential output fixing blockers has a direct, measurable impact on retention and revenue. Runway Extension: Measure how much the churn reduction extends the company’s life.`

const CEO_PROMPT = `With 8 months of runway remaining, the Founder/CEO allocates 3 core senior engineers to an exploratory Web3/AR research prototype that has no current path to revenue. The core product roadmap has 4 high-priority enterprise blockers that are causing 4% monthly churn. How do you construct the feedback and resource-reallocation framework for a 1:1 sync with the CEO without alienating them?`

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

test('the paraphrased live CEO answer cannot bypass the scenario guard', () => {
  assert.equal(answerNeedsFreshnessReflection(CEO_OVERREACH_V2), true)
  const text = answerFreshnessSignals(CEO_OVERREACH_V2)
    .filter(signal => signal.code === 'unsupported_scenario_inference')
    .map(signal => signal.excerpt)
    .join(' ')
  assert.match(text, /survival and runway/i)
  assert.match(text, /low-probability/i)
  assert.match(text, /halves in roughly 17-18 months/i)
  assert.match(text, /run out of cash/i)
  assert.match(text, /27\.4%/i)
  assert.match(text, /directly reduces revenue/i)
  assert.match(text, /measurable impact on retention and revenue/i)
  assert.match(text, /extends the company’s life/i)
})

test('high-value quantified business scenarios receive prompt-vs-draft premise review', () => {
  assert.equal(promptNeedsScenarioPremiseReview(CEO_PROMPT), true)
  assert.equal(promptNeedsScenarioPremiseReview('What is the difference between Enterprise Memory and Semantic Cache?'), false)
  assert.equal(promptNeedsScenarioPremiseReview('Draft a friendly thank-you email to my colleague.'), false)
})

test('churn compounding is allowed only as an explicitly modelled illustration', () => {
  const unsafe = 'In 8 months, a 4% monthly churn rate reduces the user base by approximately 28%.'
  const unsafeHalving = 'At 4% monthly churn, the user base halves in roughly 17-18 months.'
  const unsafeTotal = 'You will lose ~27.4% of your user base in 8 months.'
  const safe = 'If 4% monthly churn applied to a fixed cohort with no offsetting acquisition for 8 months, that cohort would decline by about 28%; this is an illustrative scenario, not a forecast of total users, revenue, or runway.'
  assert.equal(answerNeedsFreshnessReflection(unsafe), true)
  assert.equal(answerNeedsFreshnessReflection(unsafeHalving), true)
  assert.equal(answerNeedsFreshnessReflection(unsafeTotal), true)
  assert.equal(answerNeedsFreshnessReflection(safe), false)
})

test('an if-clause does not validate an unsupported revenue or runway consequence', () => {
  const unsafe = 'Even if churn falls to 2%, the company retains significantly more revenue and extends effective runway.'
  const unsafeCash = 'With 8 months of runway, the company is likely to run out of cash before churn is stabilized.'
  const unsafeRevenue = 'This directly reduces revenue and extends the time to profitability or next funding round, effectively burning through the remaining runway faster.'
  const safe = 'If churn falls to 2%, retention would improve; the revenue and runway effect could be estimated separately and depends on pricing, acquisition, and burn.'
  assert.equal(answerNeedsFreshnessReflection(unsafe), true)
  assert.equal(answerNeedsFreshnessReflection(unsafeCash), true)
  assert.equal(answerNeedsFreshnessReflection(unsafeRevenue), true)
  assert.equal(answerNeedsFreshnessReflection(safe), false)
})

test('unsupported probability and survival labels are treated as judgment, not scenario facts', () => {
  assert.equal(answerNeedsFreshnessReflection('This is a necessary defense of the company’s survival and runway.'), true)
  assert.equal(answerNeedsFreshnessReflection('We are trading a low-probability speculative bet for a high-probability, high-impact retention fix.'), true)
  assert.equal(answerNeedsFreshnessReflection('My recommendation is to prioritize the blockers because the stated churn and runway make near-term retention a reasonable priority.'), false)
})

test('proposal language is not confused with an asserted company commitment', () => {
  const safe = 'Propose a four-week blocker sprint, then review measured churn before deciding whether to restore the Web3/AR allocation.'
  assert.equal(answerNeedsFreshnessReflection(safe), false)
})

test('deterministic fallback preserves governance while removing invented strategic facts', () => {
  const answer = `Use a reversible two-to-four-week reallocation with explicit review gates. ${CEO_OVERREACH_V2} Preserve the prototype and define evidence-based conditions for restoring research capacity.`
  const stripped = stripUnsupportedCurrentClaimSentences(answer)
  assert.match(stripped, /reversible two-to-four-week reallocation/i)
  assert.match(stripped, /restoring research capacity/i)
  assert.doesNotMatch(stripped, /survival and runway/i)
  assert.doesNotMatch(stripped, /low-probability/i)
  assert.doesNotMatch(stripped, /run out of cash/i)
  assert.doesNotMatch(stripped, /directly reduces revenue/i)
})
