import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyCosEvidencePolicy } from '../lib/ai/cos/cosEvidencePolicy.ts'

test('current facts require fresh authoritative evidence regardless of topic', () => {
  for (const question of [
    'Who is the current President of the United States?',
    'Who is the current CEO of OpenAI?',
    'What is the latest version of Next.js?',
    'What is the current exchange rate for USD to EUR?',
  ]) {
    const policy = classifyCosEvidencePolicy(question)
    assert.equal(policy.mode, 'required', question)
    assert.equal(policy.freshnessRequired, true, question)
  }
})

test('stable externally verifiable facts also require evidence', () => {
  for (const question of [
    'Who wrote Hamlet?',
    'What is the capital of Poland?',
    'When did Apollo 11 land on the Moon?',
    'Where is the headquarters of the United Nations?',
  ]) {
    const policy = classifyCosEvidencePolicy(question)
    assert.equal(policy.mode, 'required', question)
    assert.equal(policy.freshnessRequired, false, question)
  }
})

test('informational explanations prefer evidence without requiring a topic allowlist', () => {
  const policy = classifyCosEvidencePolicy('Explain how TLS certificate chains work.')
  assert.equal(policy.mode, 'preferred')
  assert.equal(policy.freshnessRequired, false)
})

test('diagnostic reasoning stays on the local reasoning path rather than doing factual lookup research', () => {
  const question = 'A multi-tenant SaaS has normal database CPU but enterprise API p95 triples. Diagnose the likely architectural causes and explain how you would distinguish them without making production changes.'
  const policy = classifyCosEvidencePolicy(question)
  assert.equal(policy.mode, 'none')
  assert.equal(policy.reason, 'analytical_reasoning_task')
})

test('transformative and repo-action tasks do not trigger authoritative web research', () => {
  for (const question of [
    'Rewrite this email to be shorter.',
    'Translate this paragraph into Polish.',
    'Commit and merge the current branch.',
    'Refactor this function and open a pull request.',
  ]) {
    assert.equal(classifyCosEvidencePolicy(question).mode, 'none', question)
  }
})
