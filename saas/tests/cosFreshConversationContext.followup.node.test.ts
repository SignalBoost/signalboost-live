import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveFreshConversationContext } from '../lib/ai/cos/cosFreshConversationContext.ts'

test('measurement follow-up keeps the prior pay question in the live lookup', () => {
  const body = {
    messages: [
      { role: 'user', content: 'is there a pay gap btw women and men in the US?' },
      { role: 'assistant', content: 'Evidence indicates a persistent earnings disparity.' },
      { role: 'user', content: 'What specific factors contribute to the difference between the uncontrolled and controlled gender pay gap?' },
    ],
  }
  const result = resolveFreshConversationContext(
    body,
    'What specific factors contribute to the difference between the uncontrolled and controlled gender pay gap?',
  )
  assert.equal(result.contextUsed, true)
  assert.match(result.lookupInput, /pay gap btw women and men/i)
  assert.match(result.lookupInput, /uncontrolled and controlled/i)
})

test('truncated Did you mean chip still searches the prior topic, not verification glossaries', () => {
  const body = {
    messages: [
      { role: 'user', content: 'is there a pay gap btw women and men in the US?' },
      { role: 'assistant', content: 'Evidence indicates a persistent earnings disparity.' },
      { role: 'user', content: 'Did you mean “What specific factors contribute to the difference between the uncontrolled and ”?' },
    ],
  }
  const result = resolveFreshConversationContext(
    body,
    'Did you mean “What specific factors contribute to the difference between the uncontrolled and ”?',
  )
  assert.equal(result.contextUsed, true)
  assert.match(result.lookupInput, /pay gap btw women and men/i)
  assert.doesNotMatch(result.lookupInput, /independent verification & validation/i)
})

test('a new complete topic is still not glued onto the prior turn', () => {
  const body = {
    messages: [
      { role: 'user', content: 'is there a pay gap btw women and men in the US?' },
      { role: 'user', content: 'What is the current USD to EUR exchange rate?' },
    ],
  }
  const result = resolveFreshConversationContext(body, 'What is the current USD to EUR exchange rate?')
  assert.equal(result.contextUsed, false)
  assert.equal(result.lookupInput, 'What is the current USD to EUR exchange rate?')
})
