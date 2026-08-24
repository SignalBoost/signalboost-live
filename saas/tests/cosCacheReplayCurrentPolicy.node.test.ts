import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COS_ANSWER_GATE_REVISION,
  cachedAnswerIsCurrent,
  cosAnswerPolicyVersion,
} from '../lib/ai/cos/cosAnswerPolicy.ts'

const basePolicy = {
  reasonerSystemPrompt: 'test prompt',
  model: 'Qwen/Qwen3.6-35B-A3B',
  threshold: 0.72,
}

const policyVersion = cosAnswerPolicyVersion(basePolicy)
const now = Date.parse('2026-08-24T00:30:00.000Z')

function stamp(reply: string) {
  return {
    policyVersion,
    storedAt: '2026-08-24T00:01:23.378Z',
    reply,
  }
}

test('cache policy revision invalidates the pre-output-gate partition', () => {
  assert.match(COS_ANSWER_GATE_REVISION, /2026-08-24\.cache-replay-output-gate\.v8/)
})

test('cached crisis answer with unsupported GDPR and data-classification claims is refused before replay', () => {
  const reply = [
    'Billing records for 4,200 accounts likely contain Personal Identifiable Information (PII) and financial data.',
    'Under frameworks such as GDPR (Article 33/34) and CCPA, unauthorized alteration or loss of integrity of personal data may trigger mandatory disclosure obligations.',
    'Concealing such an event increases regulatory penalties.',
  ].join(' ')
  const verdict = cachedAnswerIsCurrent(stamp(reply), policyVersion, 24 * 60 * 60 * 1000, now)
  assert.equal(verdict.ok, false)
  if (verdict.ok) return
  assert.match(verdict.reason, /current answer-side freshness\/integrity policy/i)
})

test('cached CEO resource answer with unsupported strategic outcomes is refused before replay', () => {
  const reply = [
    'The current allocation is mathematically incompatible with the company survival timeline.',
    'We have 8 months to prove product-market fit or pivot.',
    'Every week on the prototype means bleeding users to competitors.',
    'The resulting loss is likely leading to insolvency.',
  ].join(' ')
  const verdict = cachedAnswerIsCurrent(stamp(reply), policyVersion, 24 * 60 * 60 * 1000, now)
  assert.equal(verdict.ok, false)
  if (verdict.ok) return
  assert.match(verdict.reason, /current answer-side freshness\/integrity policy/i)
})

test('cached governance advice that leaves legal applicability to Legal Privacy remains replay-compatible', () => {
  const reply = 'Preserve evidence, pause risky billing changes, and have Legal/Privacy determine whether applicable law requires customer notification before release.'
  const verdict = cachedAnswerIsCurrent(stamp(reply), policyVersion, 24 * 60 * 60 * 1000, now)
  assert.equal(verdict.ok, true)
})

test('cached strategic advice with explicit modeling assumptions remains replay-compatible', () => {
  const reply = 'If 4% monthly churn applied to a fixed cohort with no offsetting acquisition for 8 months, that cohort would decline by about 28%; treat this as an illustrative scenario, not a forecast of total users, revenue, or runway.'
  const verdict = cachedAnswerIsCurrent(stamp(reply), policyVersion, 24 * 60 * 60 * 1000, now)
  assert.equal(verdict.ok, true)
})
