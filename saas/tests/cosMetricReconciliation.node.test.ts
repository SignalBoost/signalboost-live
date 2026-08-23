import assert from 'node:assert/strict'
import test from 'node:test'
import { MEMORY_LAYER_COMPARISON_GUARDRAIL } from '../lib/ai/cos/cosMemoryLayerDefinitions.ts'

test('conflicting KPI definitions are preserved without invented funnel semantics', () => {
  const rule = MEMORY_LAYER_COMPARISON_GUARDRAIL
  assert.match(rule, /same KPI or business-metric label with different definitions/i)
  assert.match(rule, /preserve the literal definitions and values/i)
  assert.match(rule, /Do not call one metric top-of-funnel, bottom-of-funnel, dormant, exploratory, converted, monetized/i)
})

test('a ratio is not called conversion without a proven subset relationship', () => {
  assert.match(MEMORY_LAYER_COMPARISON_GUARDRAIL, /Do not label a ratio between the metrics as a conversion rate/i)
  assert.match(MEMORY_LAYER_COMPARISON_GUARDRAIL, /subset of the denominator for the same period and population/i)
})

test('investor reporting requires explicit metric governance and reconciliation', () => {
  assert.match(MEMORY_LAYER_COMPARISON_GUARDRAIL, /single canonical definition only when the prompt establishes which governance source has reporting authority/i)
  assert.match(MEMORY_LAYER_COMPARISON_GUARDRAIL, /present both values with explicit definitions and disclose the reconciliation/i)
  assert.match(MEMORY_LAYER_COMPARISON_GUARDRAIL, /replacement labels[\s\S]*clearly described as proposed labels/i)
})
