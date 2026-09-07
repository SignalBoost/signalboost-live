// saas/tests/requestUnderstanding.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { clarificationQuestion, understandRequest } from '../lib/ai/cos/requestUnderstanding.ts'

const reasoner = (verdict: unknown, seen?: Array<Record<string, unknown>>) => (async (args: Record<string, unknown>) => {
  seen?.push(args)
  return { text: JSON.stringify(verdict), reasoner: {} as any, turnId: 't' }
}) as any

const offline = (async () => null) as any

test('semantic understanding accepts ordinary requests without requiring a command vocabulary', async () => {
  const verdict = { needs_clarification: false, missing: 'none', software_repair_intent: false }
  const result = await understandRequest({ prompt: 'Explain why the build failed.' }, reasoner(verdict))
  assert.deepEqual(result, { needsClarification: false, missing: 'none', softwareRepairIntent: false })
})

test('context can make a short natural follow-up a repair request', async () => {
  const seen: Array<Record<string, unknown>> = []
  const verdict = { needs_clarification: false, missing: 'none', software_repair_intent: true }
  const result = await understandRequest({
    prompt: 'take care of it',
    previousUserPrompt: 'Vercel build failed with module not found',
    priorAnswer: 'I can repair this. Want me to?',
  }, reasoner(verdict, seen))
  assert.equal(result?.softwareRepairIntent, true)
  const classifierPrompt = String(seen[0]?.prompt || '')
  assert.match(classifierPrompt, /RECENT PREVIOUS USER MESSAGE:/)
  assert.match(classifierPrompt, /RECENT ASSISTANT ANSWER:/)
  assert.match(classifierPrompt, /CURRENT USER MESSAGE:/)
})

test('missing referent asks for clarification and never manufactures repair intent', async () => {
  const verdict = { needs_clarification: true, missing: 'referent', software_repair_intent: false }
  const result = await understandRequest({ prompt: 'please handle that' }, reasoner(verdict))
  assert.deepEqual(result, { needsClarification: true, missing: 'referent', softwareRepairIntent: false })
  assert.equal(clarificationQuestion('en', result!.missing), 'What would you like me to work on?')
})

test('supplied content with unclear action gets a natural what-do-you-want question', async () => {
  const verdict = { needs_clarification: true, missing: 'action', software_repair_intent: false }
  const result = await understandRequest({ prompt: 'Here is the document.', hasAttachments: true }, reasoner(verdict))
  assert.equal(result?.needsClarification, true)
  assert.equal(clarificationQuestion('en', result!.missing), 'What would you like me to do with this?')
})

test('semantic outage does not invent intent or force a fabricated clarification', async () => {
  assert.equal(await understandRequest({ prompt: 'anything at all' }, offline), null)
  assert.equal(await understandRequest({ prompt: 'anything at all' }, reasoner({ needs_clarification: 'yes', missing: 'both', software_repair_intent: false })), null)
})

test('clarification copy is available in every supported platform language', () => {
  for (const locale of ['en', 'es', 'pt', 'pl', 'ru']) {
    const question = clarificationQuestion(locale, 'both')
    assert.ok(question.endsWith('?'), `${locale}: ${question}`)
    assert.ok(question.length < 80, `${locale}: ${question}`)
  }
})
