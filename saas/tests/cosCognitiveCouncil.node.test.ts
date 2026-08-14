import test from 'node:test'
import assert from 'node:assert/strict'
import { assessCouncilTrigger, councilCredibilityWeight, selectCouncilRoles } from '../lib/ai/cos/cognitiveCouncil.ts'

test('routine strong low-risk work does not trigger Council', () => {
  const result = assessCouncilTrigger({
    region: 'strong',
    repeatedGapCount: 0,
    evidenceSparse: false,
    highConsequence: false,
    complexProblem: false,
  })
  assert.equal(result.trigger, false)
  assert.deepEqual(result.reasons, [])
})

test('conflicted metacognitive capability always triggers independent challenge', () => {
  const result = assessCouncilTrigger({
    region: 'conflicted',
    repeatedGapCount: 0,
    evidenceSparse: false,
    highConsequence: false,
    complexProblem: false,
  })
  assert.equal(result.trigger, true)
  assert.ok(result.reasons.some(reason => reason.includes('conflicted')))
})

test('complex sparse-evidence problem triggers Council without inventing confidence', () => {
  const result = assessCouncilTrigger({
    region: 'unknown',
    repeatedGapCount: 0,
    evidenceSparse: true,
    highConsequence: false,
    complexProblem: true,
  })
  assert.equal(result.trigger, true)
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'confidence'), false)
})

test('high-consequence work triggers Council even when capability is strong', () => {
  const result = assessCouncilTrigger({
    region: 'strong',
    repeatedGapCount: 0,
    evidenceSparse: false,
    highConsequence: true,
    complexProblem: true,
  })
  assert.equal(result.trigger, true)
})

test('Council roles include two relevant domain specialists plus skeptic', () => {
  const roles = selectCouncilRoles('Diagnose PostgreSQL connection pool saturation causing production API latency and 5xx errors')
  assert.equal(roles.length, 3)
  assert.ok(roles.includes('database'))
  assert.ok(roles.includes('sre'))
  assert.equal(roles.at(-1), 'skeptic')
})

test('specialist credibility stays neutral until enough verified history exists', () => {
  assert.equal(councilCredibilityWeight(0, 0), 1)
  assert.equal(councilCredibilityWeight(4, 4), 1)
})

test('verified history weights specialists without majority-vote semantics', () => {
  const strong = councilCredibilityWeight(20, 19)
  const weak = councilCredibilityWeight(20, 8)
  assert.ok(strong > 1)
  assert.ok(weak < strong)
  assert.ok(strong <= 1.25)
  assert.ok(weak >= 0.75)
})
