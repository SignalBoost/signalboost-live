import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDiagnosticRepairPrompt, executiveDecisionUnsupportedClaims, reasonerDraftNeedsRepair } from '../lib/ai/cos/reasonerQuality.ts'

const PROMPT = `The company is launching a self-serve, lower-cost SaaS tier to expand market share. The Head of Enterprise Sales warns that feature parity could threaten $8M in contracted renewals. Product argues that hobbling the tier destroys PLG conversion. Design the arbitration memo and rollout framework for executive alignment.`
const UNSUPPORTED = JSON.stringify({ answer: 'The $8M renewals are safe. Cannibalization risk is low. Enterprise clients will not downgrade. Set a 1,000-generation cap and launch in week 11.', confidence: .9 })
const BOUNDED = JSON.stringify({ answer: 'Treat renewal exposure and cannibalization as hypotheses. Before launch, test a tiering matrix with a bounded cohort; define contract, security, usage, and support requirements from actual customer evidence, and set rollback gates from observed downgrade and conversion rates.', confidence: .76 })

test('unsupported executive certainty and invented numeric targets trigger repair', () => {
  assert.deepEqual(executiveDecisionUnsupportedClaims(PROMPT, UNSUPPORTED), ['unsupported_certainty', 'novel_numeric_target'])
  assert.equal(reasonerDraftNeedsRepair(PROMPT, UNSUPPORTED), true)
})
test('repair prompt requires hypotheses and decision gates instead of fabricated outcomes', () => {
  const repair = buildDiagnosticRepairPrompt(PROMPT, UNSUPPORTED)
  assert.match(repair, /Do not say that renewals are safe/)
  assert.match(repair, /hypotheses, decision gates, experiments/i)
})
test('evidence-bounded executive memo is not rejected', () => {
  assert.deepEqual(executiveDecisionUnsupportedClaims(PROMPT, BOUNDED), [])
  assert.equal(reasonerDraftNeedsRepair(PROMPT, BOUNDED), false)
})
