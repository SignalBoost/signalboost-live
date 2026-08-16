import assert from 'node:assert/strict'
import test from 'node:test'
import { decideCosTurnExperience } from '../lib/ai/cos/cognitiveTurnExperience.ts'

test('accepted local COS work becomes episodic experience, not factual truth', () => {
  const decision = decideCosTurnExperience({
    prompt: 'Explain Kubernetes scheduling pressure and how to diagnose it.',
    handled: true,
    confidence: 0.78,
    provenance: {
      responseSource: 'local_cos_reasoning',
      localModelInvoked: true,
      externalAiInvoked: false,
      reasonerLabel: 'independent-local:qwen2.5-coder:32b',
      learnedItemsCited: 1,
      cognitiveSkillsCited: 1,
    },
  })

  assert.equal(decision.eligible, true)
  assert.equal(decision.acceptedByCosGate, true)
  assert.equal(decision.routeClass, 'local')
  assert.equal(decision.sourceKind, 'cos_local_reasoning')
  assert.equal(decision.evidence.semantics, 'episodic_turn_signal_not_factual_truth')
  assert.equal(decision.evidence.successSemantics, 'cos_gate_acceptance_not_verified_business_outcome')
  assert.deepEqual(decision.evidence.cited, {
    knowledgeGraph: 0,
    learnedCorpus: 1,
    enterpriseMemory: 0,
    userMemory: 0,
    cognitiveSkills: 1,
  })
  assert.equal('answer' in decision.evidence, false)
})

test('cache reuse is a separate independence signal and never claims local inference', () => {
  const decision = decideCosTurnExperience({
    prompt: 'What is Kubernetes?',
    handled: true,
    confidence: 0.78,
    provenance: {
      responseSource: 'semantic_cache',
      localModelInvoked: false,
      externalAiInvoked: false,
      reasonerLabel: 'independent-local:qwen2.5-coder:32b',
      cacheOrigin: { storedAt: '2026-08-16T03:54:03.385Z' },
    },
  })

  assert.equal(decision.routeClass, 'cache')
  assert.equal(decision.sourceKind, 'cos_answer_reuse')
  assert.equal(decision.acceptedByCosGate, true)
  assert.equal(decision.evidence.localModelInvoked, false)
  assert.equal(decision.evidence.fromCache, true)
})

test('failed local attempt remains a learning signal without becoming success', () => {
  const decision = decideCosTurnExperience({
    prompt: 'Diagnose a novel production failure.',
    handled: false,
    confidence: 0.5,
    failureReason: 'COS confidence 0.50 is below escalation threshold 0.72.',
    provenance: {
      responseSource: 'external_fallback_required',
      localModelInvoked: true,
      externalAiInvoked: false,
      escalationReasonCode: 'local_below_threshold',
    },
  })

  assert.equal(decision.routeClass, 'external_required')
  assert.equal(decision.acceptedByCosGate, false)
  assert.equal(decision.evidence.handled, false)
  assert.match(String(decision.evidence.failureReason), /below escalation threshold/)
})

test('volatile live work retains routing outcome only, not the volatile fact', () => {
  const decision = decideCosTurnExperience({
    prompt: 'Who is currently the president of the United States?',
    handled: true,
    confidence: 1,
    provenance: {
      responseSource: 'deterministic_authoritative_fact',
      localModelInvoked: false,
      externalAiInvoked: false,
      liveExternalEvidence: { sources: [{ id: 'LIVE1' }, { id: 'LIVE2' }] },
    },
  })

  assert.equal(decision.routeClass, 'fresh')
  assert.equal(decision.evidence.liveEvidenceSources, 2)
  assert.equal(decision.evidence.retentionPolicy, 'routing_outcome_only_no_volatile_fact_retention')
  assert.equal('answer' in decision.evidence, false)
})

test('empty prompt is not admitted as an experience', () => {
  const decision = decideCosTurnExperience({ prompt: '   ', handled: false, confidence: 0 })
  assert.equal(decision.eligible, false)
  assert.equal(decision.reason, 'empty_prompt')
})
