import assert from 'node:assert/strict'
import test from 'node:test'
import { MEMORY_LAYER_COMPARISON_GUARDRAIL } from '../lib/ai/cos/cosMemoryLayerDefinitions.ts'

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
