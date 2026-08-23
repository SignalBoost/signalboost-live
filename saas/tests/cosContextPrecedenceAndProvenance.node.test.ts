import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { MEMORY_LAYER_COMPARISON_GUARDRAIL } from '../lib/ai/cos/cosMemoryLayerDefinitions.ts'
import { parseLocalResult, recommendationIntegrityConflict } from '../lib/ai/cos/reasonerOutput.ts'

test('newer dated directives supersede conflicting older user-supplied records', () => {
  assert.match(MEMORY_LAYER_COMPARISON_GUARDRAIL, /later record[\s\S]*supersedes conflicting older rules/i)
  assert.match(MEMORY_LAYER_COMPARISON_GUARDRAIL, /controlling newer record/i)
})

test('contradictory top-level approval recommendations cannot pass local confidence', () => {
  const answer = [
    'The approval recommendation is to approve the renewal under the existing 3-year amortization schedule, subject to CFO signature.',
    'Record B is newer and caps all new vendor contracts at 12 months.',
    'Conclusion: The VP of Finance should not approve the 2-year term as presented.',
  ].join('\n\n')
  assert.equal(recommendationIntegrityConflict(answer), true)
  const parsed = parseLocalResult(JSON.stringify({ answer, confidence: 0.78 }))
  assert.ok(parsed)
  assert.equal(parsed.integrityConflict, true)
  assert.equal(parsed.confidence, 0.2)
})

test('a consistent recommendation is not penalized', () => {
  const answer = [
    'The approval recommendation is: not approve the 2-year renewal as presented.',
    'The newer effective-immediately record caps new vendor contracts at 12 months and delegates approvals above $25k to the VP of Finance.',
    'Conclusion: The VP of Finance should not approve the 2-year term; Vendor X should be offered a 12-month renewal instead.',
  ].join('\n\n')
  assert.equal(recommendationIntegrityConflict(answer), false)
  const parsed = parseLocalResult(JSON.stringify({ answer, confidence: 0.78 }))
  assert.ok(parsed)
  assert.equal(parsed.integrityConflict, undefined)
  assert.equal(parsed.confidence, 0.78)
})

test('provenance formatter identifies user-supplied scenario facts as task input', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosOrchestration.ts', import.meta.url), 'utf8')
  assert.match(source, /User-Supplied Task Context: MATERIAL/)
  assert.match(source, /premises were task input and were not independently sourced from the web or COS memory/)
})
