import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  answerFreshnessSignals,
  answerNeedsFreshnessReflection,
  stripUnsupportedCurrentClaimSentences,
} from '../lib/ai/cos/answerFreshnessSelfReflection.ts'

const AV_DRAFT = `This is a classic ethical dilemma. However, current industry standards, legal frameworks, and engineering priorities generally follow these principles: Most autonomous vehicle manufacturers and regulatory bodies prioritize the safety of the vehicle's occupants. In summary, the prevailing approach in current AV development is to prioritize the safety of the passenger.`

const CRISIS_LEGAL_CAVEAT = `I have analyzed the incident involving the database migration error affecting 4,200 accounts and the subsequent payment webhook outage. My read is that the VP of Engineering’s proposal to patch quietly over the weekend is operationally risky and potentially non-compliant, depending on jurisdictional factors not yet established. I cannot confirm specific legal notification deadlines (e.g., GDPR 72-hour rule, CCPA/CPRA requirements) without knowing the geographic distribution of the affected customers and the specific data fields compromised. Therefore, I recommend treating this as a high-severity incident requiring immediate containment, evidence preservation, and a formal Legal/Privacy assessment before any customer communication or permanent remediation is finalized.`

const CRISIS_OVERREACH = `Billing records for 4,200 accounts likely contain Personal Identifiable Information (PII) and financial data. Under frameworks such as GDPR (Article 33/34) and CCPA, unauthorized alteration or loss of integrity of personal data may trigger mandatory disclosure obligations. Concealing such an event increases regulatory penalties.`

const CEO_RESOURCE_OVERREACH = `The current resource allocation is mathematically incompatible with the company's survival timeline. I believe we've extracted the key technical insights we needed from the Web3/AR prototype. In 8 months, a 4% monthly churn rate reduces your user base by approximately 28% compounded. We have 8 months to prove product-market fit or pivot. Every week spent on Web3/AR is a week we are bleeding users to competitors. Reallocating the engineers retains significantly more revenue and extends effective runway. The risk is a 28% user base loss in 8 months, likely leading to insolvency.`

const CEO_RESOURCE_CONDITIONAL = `If 4% monthly churn applied to a fixed cohort with no offsetting acquisition for 8 months, that cohort would decline by about 28%; this is an illustrative retention scenario, not a forecast of total users, revenue, or runway. A four-week blocker sprint and a churn target below 2% can be proposed as decision gates rather than predicted outcomes. Revisit the Web3/AR allocation after measuring blocker completion and retention impact.`

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

test('explicit legal uncertainty and applicability gates are not rejected as current-law claims', () => {
  assert.equal(answerNeedsFreshnessReflection(CRISIS_LEGAL_CAVEAT), false)
  assert.equal(answerFreshnessSignals(CRISIS_LEGAL_CAVEAT).length, 0)
  assert.equal(answerNeedsFreshnessReflection('Notify affected customers if legally required after Legal/Privacy determines the applicable obligations.'), false)
  assert.equal(answerNeedsFreshnessReflection('Legal must determine whether applicable law requires customer notification and what deadline applies.'), false)
})

test('direct current legal mandates still trigger freshness reflection', () => {
  const answer = 'Current GDPR requirements mandate customer notification within 72 hours.'
  assert.equal(answerNeedsFreshnessReflection(answer), true)
})

test('named-regime applicability, legal consequences, and unsupplied data classifications are rejected', () => {
  assert.equal(answerNeedsFreshnessReflection(CRISIS_OVERREACH), true)
  const codes = new Set(answerFreshnessSignals(CRISIS_OVERREACH).map(signal => signal.code))
  assert.equal(codes.has('mutable_institutional_claim'), true)
  assert.equal(codes.has('unsupported_scenario_inference'), true)
})

test('CEO resource-allocation advice cannot promote plausible assumptions into asserted outcomes', () => {
  assert.equal(answerNeedsFreshnessReflection(CEO_RESOURCE_OVERREACH), true)
  const signals = answerFreshnessSignals(CEO_RESOURCE_OVERREACH)
  assert.equal(signals.some(signal => signal.code === 'unsupported_scenario_inference'), true)
  const excerpts = signals.map(signal => signal.excerpt).join(' ')
  assert.match(excerpts, /survival timeline/i)
  assert.match(excerpts, /technical insights/i)
  assert.match(excerpts, /competitors/i)
  assert.match(excerpts, /insolvency/i)
})

test('explicitly modelled churn arithmetic and proposed targets remain allowed', () => {
  assert.equal(answerNeedsFreshnessReflection(CEO_RESOURCE_CONDITIONAL), false)
})

test('mutable topic and assertion in separate sentences do not combine into a phantom freshness signal', () => {
  const answer = 'The applicable jurisdictions are not yet established. The remediation plan should require peer review before execution.'
  assert.equal(answerNeedsFreshnessReflection(answer), false)
})

test('deterministic fallback removes unsupported current-practice sentences without inventing replacements', () => {
  const answer = 'A utilitarian view would minimize total expected harm. Current industry standards generally prioritize passenger safety. A deontological view may reject intentionally redirecting lethal harm toward an innocent person.'
  const stripped = stripUnsupportedCurrentClaimSentences(answer)
  assert.match(stripped, /utilitarian view/i)
  assert.match(stripped, /deontological view/i)
  assert.doesNotMatch(stripped, /current industry standards/i)
})

test('deterministic fallback removes crisis legal/data overreach while preserving operational guidance', () => {
  const answer = `Preserve the migration script and billing snapshots. ${CRISIS_OVERREACH} Have Legal/Privacy determine the applicable notification obligations before release.`
  const stripped = stripUnsupportedCurrentClaimSentences(answer)
  assert.match(stripped, /Preserve the migration script/i)
  assert.match(stripped, /Legal\/Privacy determine/i)
  assert.doesNotMatch(stripped, /likely contain/i)
  assert.doesNotMatch(stripped, /Under frameworks such as GDPR/i)
  assert.doesNotMatch(stripped, /regulatory penalties/i)
})

test('deterministic fallback removes CEO scenario overreach but preserves actionable resource governance', () => {
  const answer = `Use a reversible two-to-four-week reallocation with explicit review gates. ${CEO_RESOURCE_OVERREACH} Preserve the Web3/AR prototype and define the conditions for restarting research.`
  const stripped = stripUnsupportedCurrentClaimSentences(answer)
  assert.match(stripped, /reversible two-to-four-week reallocation/i)
  assert.match(stripped, /conditions for restarting research/i)
  assert.doesNotMatch(stripped, /survival timeline/i)
  assert.doesNotMatch(stripped, /competitors/i)
  assert.doesNotMatch(stripped, /insolvency/i)
})

test('ordinary COS answers are freshness-reflected before turn learning and release', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosFirstAnswer.ts', import.meta.url), 'utf8')
  assert.match(source, /async function reflectOrdinaryAnswerFreshness/)
  assert.match(source, /answerFreshnessSignals\(result\.reply\)/)
  assert.match(source, /await callCosReasoner\(/)
  assert.match(source, /stripUnsupportedCurrentClaimSentences\(result\.reply\)/)
  assert.match(source, /learnFromTurn\(input, await reflectOrdinaryAnswerFreshness\(input, result\)\)/)
})
