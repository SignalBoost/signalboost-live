import assert from 'node:assert/strict'
import test from 'node:test'
import { decideVerifiedCosProductionOutcome } from '../lib/ai/cos/cognitiveVerifiedOutcome.ts'

test('verified self-healing success becomes bounded production evidence without automatic promotion', () => {
  const decision = decideVerifiedCosProductionOutcome({
    sourceClass: 'production_outcome',
    sourceRef: 'vercel-deployment:dpl_ABC123:terminal',
    domain: 'self_healing',
    outcomeStatus: 'success',
    summary: 'The exact deployment created by the governed retry reached READY.',
    problemClass: 'incident diagnosis',
    correlation: { kind: 'incident_id', value: 'incident-123' },
    idempotencyKey: 'council-objective:11111111-1111-4111-8111-111111111111',
    facts: { verified: true, state: 'READY', deploymentId: 'dpl_ABC123' },
  })

  assert.equal(decision.subject, 'incident diagnosis')
  assert.equal(decision.domain, 'self_healing')
  assert.equal(decision.outcomeStatus, 'success')
  assert.equal(decision.success, true)
  assert.equal(decision.score, 1)
  assert.equal(decision.evidence.semantics, 'verified_production_outcome_signal_not_factual_promotion')
  assert.equal(decision.evidence.successSemantics, 'externally_verified_real_world_outcome')
  assert.equal(decision.evidence.promotionPolicy, 'no_automatic_fact_or_skill_promotion')
})

test('observed non-terminal outcome is retained without being mislabeled success', () => {
  const decision = decideVerifiedCosProductionOutcome({
    sourceClass: 'deterministic_tool',
    sourceRef: 'agent-gateway:req-123',
    domain: 'self_healing',
    outcomeStatus: 'observed',
    summary: 'The governed tool completed but did not expose an explicit verification predicate.',
    problemClass: 'incident diagnosis',
  })

  assert.equal(decision.success, null)
  assert.equal(decision.score, null)
  assert.equal(decision.outcomeStatus, 'observed')
})

test('the same authoritative event derives the same experience hash', () => {
  const first = decideVerifiedCosProductionOutcome({
    sourceClass: 'authoritative_record',
    sourceRef: 'crm:opportunity:123:closed-won',
    domain: 'crm',
    outcomeStatus: 'success',
    summary: 'Opportunity closed won.',
    problemClass: 'B2B enterprise sales marketing revenue operations',
    idempotencyKey: 'crm-event:123:closed-won',
  })
  const duplicate = decideVerifiedCosProductionOutcome({
    sourceClass: 'authoritative_record',
    sourceRef: 'crm:opportunity:123:closed-won',
    domain: 'crm',
    outcomeStatus: 'success',
    summary: 'Duplicate delivery of the same closed-won event.',
    problemClass: 'B2B enterprise sales marketing revenue operations',
    idempotencyKey: 'crm-event:123:closed-won',
  })

  assert.equal(first.experienceHash, duplicate.experienceHash)
  assert.equal(first.subject, 'B2B enterprise sales marketing revenue operations')
})

test('model output cannot masquerade as verified production evidence', () => {
  assert.throws(() => decideVerifiedCosProductionOutcome({
    sourceClass: 'production_outcome',
    sourceRef: 'model:gemini-says-it-worked',
    domain: 'workflow',
    outcomeStatus: 'success',
    summary: 'A model claimed the operation succeeded.',
  }), /cannot be a verified COS production outcome source/)
})
