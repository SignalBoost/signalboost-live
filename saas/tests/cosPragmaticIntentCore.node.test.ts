import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const core = readFileSync('lib/ai/cos/cosFirstAnswerCore.ts', 'utf8')
const route = readFileSync('app/api/cos-primary/route.ts', 'utf8')
const semanticIntent = readFileSync('lib/ai/cos/cosSemanticTaskIntent.ts', 'utf8')

test('route-level neural interpretation suppression remains before live freshness work', () => {
  const heuristic = route.indexOf('heuristicRequiresFreshEvidence=requiresFreshExternalEvidence(input)&&!conversationRecallRequested')
  const semantic = route.indexOf('? await classifyCosSemanticTaskIntent')
  const semanticFresh = route.indexOf('semanticRequiresFreshEvidence=Boolean(')
  const baseline = route.indexOf('baselineRequiresFreshEvidence=(heuristicRequiresFreshEvidence||semanticRequiresFreshEvidence)&&!conversationRecallRequested')
  const finalGate = route.indexOf('requiresFreshEvidence=baselineRequiresFreshEvidence&&!semanticIntentSuppressesFreshness')
  const liveSearch = route.indexOf('freshEvidenceSearchQueries(lookupInput)')

  assert.ok(heuristic >= 0)
  assert.ok(semantic > heuristic)
  assert.ok(semanticFresh > semantic)
  assert.ok(baseline > semanticFresh)
  assert.ok(finalGate > baseline)
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

test('ordinary answerable turns do not pay a semantic-classifier round trip', () => {
  assert.match(route, /const semanticTaskIntentNeeded=!requestedAction\s*&& \(heuristicRequiresFreshEvidence \|\| freshConversationContext\.contextUsed\)/)
  const ownerFastPath = route.indexOf('if(access?.isOwner&&isPlatformSelfKnowledgePrompt(input))')
  const semanticGate = route.indexOf('const semanticTaskIntentNeeded=')
  assert.ok(ownerFastPath >= 0)
  assert.ok(semanticGate > ownerFastPath, 'owner self-knowledge must release before semantic routing')
})

test('semantic intent calls are low-latency interactive classification, not 120-second reasoning', () => {
  assert.match(semanticIntent, /usageContext: \{ feature: 'cos_interactive_answer', purpose: 'semantic_task_intent' \}/)
  assert.match(semanticIntent, /disableThinking: true/)
  assert.match(semanticIntent, /timeoutMs: 8_000/)
  assert.match(semanticIntent, /jsonObject: true/)
})


test('ordinary COS questions return before non-critical provenance persistence', () => {
  assert.match(route, /function persistCosPrimaryProvenanceAfterResponse/)
  assert.match(route, /after\(async\(\)=>\{/)

  const ownerFastPath = route.indexOf('if(access?.isOwner&&isPlatformSelfKnowledgePrompt(input))')
  const ownerReturn = route.indexOf("source:'cos-owner-self-knowledge'", ownerFastPath)
  const ownerBlock = route.slice(ownerFastPath, ownerReturn)
  assert.match(ownerBlock, /persistCosPrimaryProvenanceAfterResponse/)
  assert.doesNotMatch(ownerBlock, /await writeCosPrimaryProvenance/)

  const ordinaryHandled = route.indexOf('if(cos?.handled)')
  const bestEffort = route.indexOf("source:'cos-local-best-effort'", ordinaryHandled)
  const ordinaryBlock = route.slice(ordinaryHandled, bestEffort)
  assert.match(ordinaryBlock, /persistCosPrimaryProvenanceAfterResponse/)
  assert.doesNotMatch(ordinaryBlock, /await writeCosPrimaryProvenance/)
})
