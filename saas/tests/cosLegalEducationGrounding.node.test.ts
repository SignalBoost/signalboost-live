import assert from 'node:assert/strict'
import test from 'node:test'
import { COS_REASONER_SYSTEM_PROMPT } from '../lib/ai/cos/cosFirstAnswerEnterprise.ts'

test('COS requires official evidence before asserting jurisdiction-specific mediator credentials', () => {
  const prompt = COS_REASONER_SYSTEM_PROMPT('Polski', {
    audience: 'user' as never,
    question: 'Przeprowadź mnie przez mediacje rodzinne w Polsce i wymagania dla stałego mediatora.',
  })
  assert.match(prompt, /JURISDICTIONAL LAW AND QUALIFICATION CLAIMS/)
  assert.match(prompt, /Verify against current primary official legal or regulator sources/)
  assert.match(prompt, /distinguish legal requirements from professional training recommendations/)
  assert.match(prompt, /teach progressively/)
  assert.match(prompt, /requested language/)
})
