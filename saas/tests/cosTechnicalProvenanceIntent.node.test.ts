import assert from 'node:assert/strict'
import test from 'node:test'
import { asksForTechnicalPriorAnswerProvenance } from '../lib/ai/cos/technicalProvenanceIntent.ts'
import { isProvenanceIntrospection } from '../lib/ai/cos/provenanceIntrospection.ts'

const productionFailure = 'Show me the complete provenance for the answer you just gave. Identify the primary model that generated the reasoning. List every COS internal system that materially contributed: semantic cache, Enterprise Memory, Knowledge Graph, learned corpus, autonomous research, local reasoning engine, and any external AI provider. For each one, state whether it was actually used, what evidence it contributed, and whether any new knowledge was retrieved or learned during this request. Do not list a component merely because it exists.'

test('long technical provenance audit for the prior answer routes to recorded telemetry', () => {
  assert.ok(productionFailure.length > 300)
  assert.equal(asksForTechnicalPriorAnswerProvenance(productionFailure), true)
  assert.equal(isProvenanceIntrospection(productionFailure), true)
})

test('technical provenance detector does not hijack general architecture questions', () => {
  for (const query of [
    'Explain provenance systems for AI applications.',
    'What is a semantic cache and how does it work?',
    'List the components of a good execution telemetry system.',
    'Which model should generate reasoning in a RAG architecture?',
  ]) {
    assert.equal(asksForTechnicalPriorAnswerProvenance(query), false, query)
  }
})

test('a prior-answer reference alone is not enough without provenance intent', () => {
  assert.equal(asksForTechnicalPriorAnswerProvenance('Rewrite the answer you just gave in two sentences.'), false)
})
