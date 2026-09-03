import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const core = readFileSync('lib/ai/cos/cosFirstAnswerCore.ts', 'utf8')
const route = readFileSync('app/api/cos-primary/route.ts', 'utf8')
const semanticIntent = readFileSync('lib/ai/cos/cosSemanticTaskIntent.ts', 'utf8')

test('route-level neural interpretation suppression remains before live freshness work', () => {
  const baseline = route.indexOf('baselineRequiresFreshEvidence=requiresFreshExternalEvidence(input)')
  const semantic = route.indexOf('? await classifyCosSemanticTaskIntent')
  const finalGate = route.indexOf('requiresFreshEvidence=baselineRequiresFreshEvidence&&!semanticIntentSuppressesFreshness')
  const liveSearch = route.indexOf('freshEvidenceSearchQueries(lookupInput)')

  assert.ok(baseline >= 0)
  assert.ok(semantic > baseline)
  assert.ok(finalGate > semantic)
  assert.ok(liveSearch > finalGate)
  assert.match(route, /event:'freshness_semantic_intent_suppressed'/)
})

test('shared COS core cannot re-impose freshness after neural contextual interpretation', () => {
  assert.match(core, /classifyCosSemanticTaskIntent/)
  assert.match(core, /semanticIntentSuppressesFreshness/)
  assert.match(core, /const baselineRequiresFreshEvidence = requiresFreshExternalEvidence\(input\.prompt\)/)
  assert.match(core, /const suppressFreshnessForInterpretation = semanticIntentSuppressesFreshness\(semanticTaskIntent\)/)
  assert.match(core, /if \(baselineRequiresFreshEvidence && !suppressFreshnessForInterpretation\) \{\s*return learnFromTurn\(input, await tryFreshCurrentFact\(input\)\)/s)
  assert.match(core, /if \(!suppressFreshnessForInterpretation && classifyKnowledgeAccess\(input\.prompt\)\.mode === 'search_if_thin'\)/)
  assert.match(core, /\[cos-core-contextual-freshness-suppressed\]/)
})

test('contextual interpretation suppression remains neural and fail-safe', () => {
  assert.match(semanticIntent, /mode === 'contextual_interpretation'/)
  assert.match(semanticIntent, /suppliedContextPrimary/)
  assert.match(semanticIntent, /!intent\.externalFactsRequired/)
  assert.match(semanticIntent, /intent\.confidence >= 0\.72/)
  assert.match(semanticIntent, /When ambiguous between interpretation and verification, prefer external_fact_verification/i)
})

test('the Production failure phrase can only come from a freshness path that contextual interpretation now gates off', () => {
  assert.match(core, /Current-fact synthesis confidence \$\{confidence\.toFixed\(2\)\} is below threshold/)
  const failure = core.indexOf('Current-fact synthesis confidence ${confidence.toFixed(2)} is below threshold')
  const guardedFreshCall = core.indexOf('if (baselineRequiresFreshEvidence && !suppressFreshnessForInterpretation)')
  assert.ok(failure >= 0)
  assert.ok(guardedFreshCall >= 0)
  assert.match(core, /return learnFromTurn\(input, await tryFreshCurrentFact\(input\)\)/)
})
