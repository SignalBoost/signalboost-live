import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveFreshConversationContext } from '../lib/ai/cos/cosFreshConversationContext.ts'

test('pronoun follow-up carries forward the prior user entity without trusting assistant text', () => {
  const body = {
    messages: [
      { role: 'user', content: 'who is Hayden Panettiere?' },
      { role: 'assistant', content: 'An intentionally untrusted assistant biography.' },
      { role: 'user', content: 'when did she died?' },
    ],
  }
  const result = resolveFreshConversationContext(body, 'when did she died?')
  assert.equal(result.contextUsed, true)
  assert.match(result.lookupInput, /Hayden Panettiere/)
  assert.match(result.lookupInput, /when did she died/i)
  assert.doesNotMatch(result.lookupInput, /intentionally untrusted assistant biography/)
})

test('standalone complete fresh question is not polluted by prior conversation', () => {
  const body = {
    messages: [
      { role: 'user', content: 'Tell me about Company A' },
      { role: 'user', content: 'What is the current USD to EUR exchange rate?' },
    ],
  }
  const result = resolveFreshConversationContext(body, 'What is the current USD to EUR exchange rate?')
  assert.equal(result.contextUsed, false)
  assert.equal(result.lookupInput, 'What is the current USD to EUR exchange rate?')
})

test('context-dependent query without a prior user turn remains unresolved and can fail closed safely', () => {
  const result = resolveFreshConversationContext({ messages: [{ role: 'user', content: 'when did she die?' }] }, 'when did she die?')
  assert.equal(result.contextUsed, false)
  assert.equal(result.lookupInput, 'when did she die?')
})

test('short elliptical follow-up can use the immediately prior user question', () => {
  const body = { messages: [
    { role: 'user', content: 'Did Example Person die?' },
    { role: 'assistant', content: 'irrelevant' },
    { role: 'user', content: 'when?' },
  ] }
  const result = resolveFreshConversationContext(body, 'when?')
  assert.equal(result.contextUsed, true)
  assert.match(result.lookupInput, /Example Person/)
})
