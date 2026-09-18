// saas/tests/localInferenceUsageCoercion.node.test.ts
// Pins the unreported-vs-zero distinction in provider_inference_usage. Before this, Number(null) === 0
// stored a genuine zero for every value the provider did not report, making "not reported" and
// "reported zero" indistinguishable in the token and cost columns.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'

const SOURCE = readFileSync(new URL('../lib/ai/localInferenceUsage.ts', import.meta.url), 'utf8')

// Local mirror of the shipped guard, so the behaviour is asserted without loading the module's
// @supabase/supabase-js import (the repo test runner runs without node_modules installed).
function usageValueReported(value: unknown): boolean {
  return value !== null
    && value !== undefined
    && typeof value !== 'boolean'
    && !(typeof value === 'string' && value.trim() === '')
}

function nonNegativeInt(value: unknown): number | null {
  if (!usageValueReported(value)) return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
}

function nonNegativeNumber(value: unknown): number | null {
  if (!usageValueReported(value)) return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

test('unreported values stay null instead of becoming zero', () => {
  for (const value of [null, undefined, '', '   ', false, true]) {
    assert.equal(nonNegativeInt(value), null, `nonNegativeInt(${String(value)})`)
    assert.equal(nonNegativeNumber(value), null, `nonNegativeNumber(${String(value)})`)
  }
})

test('genuine zeros still store as zero', () => {
  assert.equal(nonNegativeInt(0), 0)
  assert.equal(nonNegativeInt('0'), 0)
  assert.equal(nonNegativeNumber(0), 0)
  assert.equal(nonNegativeNumber('0.0'), 0)
})

test('reported values are preserved and floored', () => {
  assert.equal(nonNegativeInt(1287), 1287)
  assert.equal(nonNegativeInt(12.9), 12)
  assert.equal(nonNegativeNumber(0.00042), 0.00042)
})

test('negative and unparseable values remain null', () => {
  assert.equal(nonNegativeInt(-1), null)
  assert.equal(nonNegativeInt('abc'), null)
  assert.equal(nonNegativeNumber(Number.NaN), null)
  assert.equal(nonNegativeNumber(Number.POSITIVE_INFINITY), null)
})

test('shipped module guards before coercion', () => {
  assert.match(SOURCE, /export function usageValueReported/)
  assert.match(SOURCE, /if \(!usageValueReported\(value\)\) return null/)
  // Both coercers must be guarded, not just the integer one.
  assert.equal(SOURCE.match(/if \(!usageValueReported\(value\)\) return null/g)?.length, 2)
})

test('cost_source is derived from the stored value, not the raw input', () => {
  assert.match(SOURCE, /const providerEstimatedCostUsd = nonNegativeNumber\(record\.providerEstimatedCostUsd\)/)
  assert.match(SOURCE, /cost_source: providerEstimatedCostUsd === null \? 'unreported' : 'provider_reported'/)
  assert.doesNotMatch(SOURCE, /cost_source: record\.providerEstimatedCostUsd === null/)
})
