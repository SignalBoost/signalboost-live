import assert from 'node:assert/strict'
import test from 'node:test'
import { MEMORY_LAYER_COMPARISON_GUARDRAIL } from '../lib/ai/cos/cosMemoryLayerDefinitions.ts'
import { metricReconciliationIntegrityConflict, parseLocalResult } from '../lib/ai/cos/reasonerOutput.ts'

test('conflicting KPI definitions are preserved without invented funnel semantics', () => {
  const rule = MEMORY_LAYER_COMPARISON_GUARDRAIL
  assert.match(rule, /same KPI or business-metric label with different definitions/i)
  assert.match(rule, /preserve the literal definitions and values/i)
  assert.match(rule, /Do not call one metric top-of-funnel, bottom-of-funnel, dormant, exploratory, converted, monetized/i)
})

test('arithmetic differences do not become invented cohorts', () => {
  const rule = MEMORY_LAYER_COMPARISON_GUARDRAIL
  assert.match(rule, /arithmetic difference[\s\S]*only a difference in counts/i)
  assert.match(rule, /does not prove cohort membership, a subset relationship, or what the gap represents/i)
  assert.match(rule, /active-but-not-billable users, free-tier users, trial users, non-core users/i)
})

test('a ratio is not called conversion without a proven subset relationship', () => {
  assert.match(MEMORY_LAYER_COMPARISON_GUARDRAIL, /Do not label a ratio between the metrics as a conversion rate/i)
  assert.match(MEMORY_LAYER_COMPARISON_GUARDRAIL, /subset of the denominator for the same period and population/i)
})

test('metric discrepancy does not prove a business model or stakeholder impact', () => {
  const rule = MEMORY_LAYER_COMPARISON_GUARDRAIL
  assert.match(rule, /Do not infer an unstated business model such as freemium or usage-based/i)
  assert.match(rule, /monetization potential, engagement, ecosystem size, churn, or growth/i)
})

test('investor reporting requires explicit metric governance and reconciliation', () => {
  const rule = MEMORY_LAYER_COMPARISON_GUARDRAIL
  assert.match(rule, /single canonical definition only when the prompt establishes which governance source has reporting authority/i)
  assert.match(rule, /Do not nominate the Board, CFO, Finance, Product, Investor Relations/i)
  assert.match(rule, /designated reporting owner or governance body/i)
  assert.match(rule, /present both values with explicit definitions and disclose the reconciliation/i)
  assert.match(rule, /replacement labels[\s\S]*clearly described as proposed labels/i)
})

test('metric reconciliation performs a final unsupported-inference audit', () => {
  assert.match(MEMORY_LAYER_COMPARISON_GUARDRAIL, /Before finalizing a metric-reconciliation answer/i)
  assert.match(MEMORY_LAYER_COMPARISON_GUARDRAIL, /remove or explicitly label as hypothesis/i)
})

test('self-contradictory MAU reconciliation cannot clear the confidence gate', () => {
  const answer = [
    'State clearly that the 168,000-user gap represents users who are active but not yet billable, for example free-tier users or trial users.',
    'Do not label this gap as dormant, exploratory, or top-of-funnel unless internal data explicitly categorizes them as such.',
    'No single governance source has been established to override the other for investor reporting.',
    'Recommend that the Board or CFO designate which metric is the official MAU for investor decks.',
  ].join('\n\n')
  assert.equal(metricReconciliationIntegrityConflict(answer), true)
  const parsed = parseLocalResult(JSON.stringify({ answer, confidence: 0.78 }))
  assert.ok(parsed)
  assert.equal(parsed.integrityConflict, true)
  assert.equal(parsed.confidence, 0.2)
})

test('consistent metric reconciliation is not integrity-capped', () => {
  const answer = [
    'Present 250,000 with the definition any authenticated session.',
    'Present 82,000 with the definition at least one billable core event.',
    'The numerical difference is 168,000, but the prompt does not establish what population that difference represents or whether one metric is a subset of the other.',
    'Use a single MAU definition only after the designated reporting owner or governance body establishes the canonical external-reporting definition.',
  ].join('\n\n')
  assert.equal(metricReconciliationIntegrityConflict(answer), false)
  const parsed = parseLocalResult(JSON.stringify({ answer, confidence: 0.78 }))
  assert.ok(parsed)
  assert.equal(parsed.integrityConflict, undefined)
  assert.equal(parsed.confidence, 0.78)
})
