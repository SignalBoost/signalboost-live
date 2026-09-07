import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('controlled evaluations bypass the multi-member council before their bounded worker call', () => {
  const reasoner = readFileSync(new URL('../lib/ai/cos/cosReasoner.ts', import.meta.url), 'utf8')
  assert.match(reasoner, /currentReasoningEvaluationContext\(\)/)
  assert.match(reasoner, /if \(currentReasoningEvaluationContext\(\)\) return false/)
})
