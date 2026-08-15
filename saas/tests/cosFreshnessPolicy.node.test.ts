import assert from 'node:assert/strict'
import test from 'node:test'
import { freshnessPolicyForQuestion, requiresFreshExternalEvidence } from '@/lib/ai/cos/cosFreshnessPolicy'

test('current facts require fresh knowledge without topic-specific role lists', () => {
  for (const question of [
    'Who is the current President of the United States?',
    'Who is the current CEO of Apple?',
    'What is the latest version of Next.js?',
    'What is the exchange rate right now?',
    "What is today's weather forecast?",
  ]) {
    const policy=freshnessPolicyForQuestion(question)
    assert.equal(policy.required,true,question)
    assert.equal(policy.forceLiveVerification,false,question)
    assert.ok(Number(policy.maxMemoryAgeMs)>0,question)
  }
})

test('present-tense role relations get a bounded memory freshness window generically', () => {
  for (const question of [
    'Who is the President of the United States?',
    'Who is the CEO of Apple?',
    'Who leads the European Commission?',
  ]) {
    const policy=freshnessPolicyForQuestion(question)
    assert.equal(policy.required,true,question)
    assert.equal(policy.reason,'present_tense_role_relation',question)
    assert.equal(policy.maxMemoryAgeMs,24*60*60*1000,question)
  }
})

test('ordinary identity is memory-first rather than automatically treated as volatile', () => {
  assert.equal(freshnessPolicyForQuestion('Who is William Shakespeare?').required,false)
  assert.equal(freshnessPolicyForQuestion('Who is Satya Nadella?').required,false)
})

test('explicit verification bypasses remembered/cache answers and checks live evidence', () => {
  const policy=freshnessPolicyForQuestion('Verify from an authoritative source who leads Acme today.')
  assert.equal(policy.required,true)
  assert.equal(policy.forceLiveVerification,true)
  assert.equal(policy.maxMemoryAgeMs,0)
})

test('historical, diagnostic, and stable explanatory questions stay memory/local-reasoning first', () => {
  for (const question of [
    'Who was President of the United States in 1999?',
    'Explain database transaction isolation levels.',
    'Diagnose enterprise-only API latency with normal database CPU.',
    'Rewrite this email to be shorter.',
  ]) {
    assert.equal(freshnessPolicyForQuestion(question).required,false,question)
  }
})

test('legacy external-provider freshness hook is retired', () => {
  // Freshness is handled inside COS now; it is no longer permission to route the fact to Gemini.
  assert.equal(requiresFreshExternalEvidence('Who is the current President of the United States?'),false)
})
