import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isSignalBoostSpecificPublicRequest,
  publicScenarioScopeViolations,
  publicUserRequestText,
} from '../lib/ai/cos/publicScenarioScope.ts'

const genericScenario = `A single enterprise client represents 38% of total company ARR. Their contract renewal is up in 90 days. They demand three custom features built specifically for their internal legacy infrastructure, threatening to churn if they are not delivered. Building these features requires halting the entire core multi-tenant roadmap for two quarters. How do you lead the executive team through evaluating and responding to this demand?`

const wrappedScenario = `CURRENT-REQUEST PREMISE RULE: Facts supplied by the user may be used as task premises. This premise rule never overrides authoritative SignalBoost product catalog truth.\n\nUSER REQUEST:\n${genericScenario}`

test('internal premise wrapper cannot turn a generic company scenario into a SignalBoost request', () => {
  assert.equal(publicUserRequestText(wrappedScenario), genericScenario)
  assert.equal(isSignalBoostSpecificPublicRequest(wrappedScenario), false)
})

test('an explicitly SignalBoost request still uses SignalBoost-specific scope', () => {
  assert.equal(isSignalBoostSpecificPublicRequest('How should SignalBoost position the Integrations Hub for enterprise buyers?'), true)
})

test('generic scenario scope rejects the exact SignalBoost leakage seen in Concierge', () => {
  const bad = `As COS, I do not have access to SignalBoost’s private financial data, specific customer contracts, or internal roadmap priorities. The public product catalog emphasizes the Integrations Hub, so the company should consider that product.`
  const violations = publicScenarioScopeViolations(genericScenario, bad)
  assert.ok(violations.includes('signalboost_context_leak'))
  assert.ok(violations.includes('user_premise_access_disclaimer'))
})

test('generic scenario scope accepts direct analysis that uses the supplied premises without claiming verification', () => {
  const good = `Treat the 38% ARR concentration and 90-day renewal as the governing premises. I would frame the decision around revenue-at-risk, roadmap opportunity cost, whether the requested work can become a reusable integration layer, and what commercial commitments would justify any exception.`
  assert.deepEqual(publicScenarioScopeViolations(genericScenario, good), [])
})
