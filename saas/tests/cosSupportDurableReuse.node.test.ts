import assert from 'node:assert/strict'
import test from 'node:test'
import { isStableSupportReuseCandidate, supportReuseKey } from '../lib/cos/supportResponseReuse'

test('stable non-privileged support questions are reusable', () => {
  assert.equal(isStableSupportReuseCandidate({
    prompt: 'Explain what a landing page is and why businesses use one.',
    isPrivileged: false,
  }), true)
})

test('live, personal, actionable, privileged, and attachment requests are never reused', () => {
  const blocked = [
    'What is the current price of the Growth plan?',
    'How many users do we have today?',
    'Research the latest AI marketing news.',
    'Create an outreach campaign for this company.',
    'Remember my preferred language.',
  ]
  for (const prompt of blocked) {
    assert.equal(isStableSupportReuseCandidate({ prompt, isPrivileged: false }), false, prompt)
  }
  assert.equal(isStableSupportReuseCandidate({ prompt: 'Explain landing pages.', isPrivileged: true }), false)
  assert.equal(isStableSupportReuseCandidate({ prompt: 'Explain landing pages.', isPrivileged: false, hasAttachments: true }), false)
  assert.equal(isStableSupportReuseCandidate({ prompt: 'Explain landing pages.', isPrivileged: false, executeMode: true }), false)
})

test('reuse key is deterministic across harmless whitespace and casing', () => {
  const first = supportReuseKey({
    prompt: 'Explain   Landing Pages',
    language: 'EN',
    currentPage: '/dashboard',
  })
  const second = supportReuseKey({
    prompt: ' explain landing pages ',
    language: 'en',
    currentPage: '/dashboard',
  })
  assert.equal(first, second)
  assert.match(first, /^support-reuse:[a-f0-9]{64}$/)
})
