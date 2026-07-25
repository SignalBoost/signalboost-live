// saas/tests/agentGatewayClassifier.node.test.ts
//
// Proves the four properties the reference classifier is relied on for: categorical (never
// scored), deterministic, escalate-only (no rule can downgrade — including a buyer's), and
// fail-closed (silence means "ask a human").

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createConsequenceClassifier,
  defaultConsequenceClassifier,
  DEFAULT_CLASSIFICATION_RULES,
  tokenize,
} from '../agent-gateway/classifier.ts'
import { evaluate } from '../agent-gateway/governance.ts'
import { HUMAN_ONLY_CLASSES } from '../agent-gateway/types.ts'
import type { AgentRequest, GovernancePolicy } from '../agent-gateway/types.ts'

function req(kind: string, target: string, params?: Record<string, unknown>): AgentRequest {
  return {
    requestId: `r_${kind}_${target}`,
    protocol: 'test',
    agentId: 'agent-1',
    action: { kind, target, params },
  }
}

test('tokenizer splits snake_case, camelCase, ACRONYMCase and dot.notation alike', () => {
  assert.deepEqual(tokenize('NAV_LAND'), ['nav', 'land'])
  assert.deepEqual(tokenize('wireTransfer'), ['wire', 'transfer'])
  assert.deepEqual(tokenize('HTTPSend'), ['http', 'send'])
  assert.deepEqual(tokenize('billing.invoice-create'), ['billing', 'invoice', 'create'])
})

test('each consequence class is recognized from a realistic action', () => {
  const c = defaultConsequenceClassifier
  assert.equal(c.classify(req('robot_command', 'NAV_LAND')), 'safety')
  assert.equal(c.classify(req('tool_call', 'wireTransfer')), 'financial')
  assert.equal(c.classify(req('tool_call', 'delete_customer_records')), 'data_destructive')
  assert.equal(c.classify(req('tool_call', 'send_email')), 'external_effect')
  assert.equal(c.classify(req('tool_call', 'restart_worker')), 'reversible_internal')
})

test('financial is caught from parameter KEYS even when the target looks harmless', () => {
  // The verb says nothing; the shape of the payload gives it away.
  assert.equal(
    defaultConsequenceClassifier.classify(req('tool_call', 'process', { amount_cents: 500_00, currency: 'USD' })),
    'financial',
  )
})

test('FAIL-CLOSED: an unrecognized action is unknown, and unknown is human-only', () => {
  const cls = defaultConsequenceClassifier.classify(req('tool_call', 'frobnicate_the_widget'))
  assert.equal(cls, 'unknown')
  assert.ok(HUMAN_ONLY_CLASSES.includes(cls))
})

test('FAIL-CLOSED: a malformed request classifies as unknown rather than throwing', () => {
  const broken = { requestId: 'x', protocol: 'test', agentId: 'a' } as unknown as AgentRequest
  assert.equal(defaultConsequenceClassifier.classify(broken), 'unknown')
})

test('DETERMINISTIC: the same request classifies identically across repeated calls', () => {
  const r = req('tool_call', 'publish_release_notes')
  const runs = Array.from({ length: 50 }, () => defaultConsequenceClassifier.classify(r))
  assert.equal(new Set(runs).size, 1)
  assert.equal(runs[0], 'external_effect')
})

test('ESCALATE-ONLY: when two classes match, the more severe one wins', () => {
  // 'send' => external_effect, 'payment' => financial. Financial outranks it.
  assert.equal(defaultConsequenceClassifier.classify(req('tool_call', 'send_payment')), 'financial')
  // 'get' => reversible_internal, 'land' => safety. Safety outranks it.
  assert.equal(defaultConsequenceClassifier.classify(req('tool_call', 'get_landing_clearance_and_land')), 'safety')
})

test('ESCALATE-ONLY: a BUYER rule cannot downgrade a dangerous action', () => {
  // A buyer (or a compromised config) declares money movement routine. It must not work.
  const permissive = createConsequenceClassifier({
    rules: [{ id: 'buyer.oops', consequenceClass: 'reversible_internal', tokens: ['transfer', 'payment'] }],
  })
  assert.equal(permissive.classify(req('tool_call', 'wireTransfer')), 'financial')
  assert.equal(permissive.classify(req('tool_call', 'send_payment')), 'financial')
})

test('ESCALATE-ONLY: a buyer rule CAN raise an otherwise-routine internal action', () => {
  const strict = createConsequenceClassifier({
    rules: [{ id: 'buyer.tenancy', consequenceClass: 'data_destructive', tokens: ['reindex'] }],
  })
  assert.equal(defaultConsequenceClassifier.classify(req('tool_call', 'reindex_search')), 'reversible_internal')
  assert.equal(strict.classify(req('tool_call', 'reindex_search')), 'data_destructive')
})

test('an explicit unknown rule beats a routine match — abstention is contagious', () => {
  const cautious = createConsequenceClassifier({
    rules: [{ id: 'buyer.quarantine', consequenceClass: 'unknown', tokens: ['restart'] }],
  })
  assert.equal(cautious.classify(req('tool_call', 'restart_worker')), 'unknown')
})

test('the safe-recovery playbook stays reversible: RETURN_TO_LAUNCH is not swept up as safety', () => {
  // FDIR: return-to-base is the pre-authorized recovery; landing somewhere new is not.
  assert.equal(defaultConsequenceClassifier.classify(req('robot_command', 'RETURN_TO_LAUNCH')), 'reversible_internal')
  assert.equal(defaultConsequenceClassifier.classify(req('robot_command', 'NAV_LAND')), 'safety')
})

test('END TO END: the classifier drives Gate 1 — allowlisting a financial action does not free it', () => {
  const policy: GovernancePolicy = {
    classifier: defaultConsequenceClassifier,
    allowlist: [
      { actionKind: 'tool_call', target: 'restart_worker', rollback: 'restore previous worker generation' },
      // Deliberately allowlisted, and deliberately must NOT run:
      { actionKind: 'tool_call', target: 'wireTransfer', rollback: 'reverse the wire' },
    ],
  }

  const routine = evaluate(req('tool_call', 'restart_worker'), policy)
  assert.equal(routine.consequenceClass, 'reversible_internal')
  assert.equal(routine.verdict, 'execute')

  const money = evaluate(req('tool_call', 'wireTransfer'), policy)
  assert.equal(money.consequenceClass, 'financial')
  assert.equal(money.verdict, 'halt_for_approval')

  const strange = evaluate(req('tool_call', 'frobnicate_the_widget'), policy)
  assert.equal(strange.consequenceClass, 'unknown')
  assert.equal(strange.verdict, 'halt_for_approval')
})

test('the built-in rule set is inspectable and every rule names a valid class', () => {
  assert.ok(DEFAULT_CLASSIFICATION_RULES.length > 0)
  const valid = new Set([...HUMAN_ONLY_CLASSES, 'reversible_internal'])
  for (const rule of DEFAULT_CLASSIFICATION_RULES) {
    assert.ok(rule.id, 'every rule carries an auditable id')
    assert.ok(valid.has(rule.consequenceClass), `unexpected class in ${rule.id}`)
  }
})
