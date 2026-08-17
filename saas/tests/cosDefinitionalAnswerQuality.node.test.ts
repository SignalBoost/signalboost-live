import assert from 'node:assert/strict'
import test from 'node:test'
import { promptAppearsDiagnostic } from '../lib/ai/cos/reasonerQuality.ts'
import { canonicalSelfKnowledgeContribution } from '../lib/ai/cos/cosMemoryLayerDefinitions.ts'
import { authoritativeProvenance, formatAuthoritativeProvenance } from '../lib/ai/cos/cosOrchestration.ts'

test('definitional questions are not classified as diagnostic', () => {
  assert.equal(promptAppearsDiagnostic('What is the difference between Enterprise Memory and Semantic Cache?'), false)
})
test('diagnostic questions remain classified as diagnostic', () => {
  assert.equal(promptAppearsDiagnostic('Why is production latency spiking right now?'), true)
})
test('canonical definitions are recorded as material provenance when used', () => {
  const contribution=canonicalSelfKnowledgeContribution('Enterprise Memory is durable organization-scoped operational knowledge, while Semantic Cache is policy-versioned, age-bounded reuse of a prior answer.')
  assert.equal(contribution.used, true)
  const provenance=authoritativeProvenance({confidence:.85,provenance:{responseSource:'local_cos_reasoning',localModelInvoked:true,reasonerLabel:'independent-local:test',canonicalSelfKnowledgeUsed:contribution,evidenceFunnel:{knowledgeGraph:{retrieved:0,relevant:0,selected:0,injected:0,cited:0},learnedCorpus:{retrieved:0,relevant:0,selected:0,injected:0,cited:0},userMemory:{retrieved:0,relevant:0,selected:0,injected:0,cited:0}}}},{invoked:false})
  assert.equal(provenance.canonical_self_knowledge.used,true)
  assert.match(formatAuthoritativeProvenance(provenance,'en'),/Canonical Self-Knowledge: USED — Enterprise Memory definition, Semantic Cache definition contributed material to the answer\./)
})
