// saas/tests/cosConversationRecall.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  COS_CONVERSATION_RECALL_MAX_CHARS,
  buildConversationRecallContext,
  detectConversationRecallIntent,
  formatConversationRecallContext,
  recallSearchQuery,
} from '../lib/ai/cos/cosConversationRecall.ts'

const user = 'a911816e-32d9-4954-b539-0e885ce2d18b'
const current = '11111111-2222-4333-8444-555555555555'
const result = { title: 'University approvals', summary: 'Discussed the one-click approval page', lastActive: '2026-09-15T22:40:00Z', snippets: ['We added a read-back so approvals are confirmed.'] }

test('references to earlier conversations are recognised in all five platform languages', () => {
  for (const prompt of [
    'what did we talk about last week about the University?',
    'continue where we left off on the approval page',
    'remember what you told me about RunPod?',
    'as we discussed, draft the email',
    'de qué hablamos la última vez sobre el precio?',
    'o que conversamos sobre o Concierge?',
    'o czym rozmawialiśmy wczoraj?',
    'что мы обсуждали про RunPod?',
  ]) assert.equal(detectConversationRecallIntent(prompt), true, prompt)
})

test('ordinary questions do not trigger recall', () => {
  for (const prompt of ['what is the capital of Portugal?', 'draft a launch email for iTMounts', 'explain RunPod pricing', 'who won the most fifa world cups?']) {
    assert.equal(detectConversationRecallIntent(prompt), false, prompt)
  }
})

test('the history search uses topic words, not the recall phrasing', () => {
  assert.equal(recallSearchQuery('what did we talk about last week about the University approvals?'), 'university or approvals')
  assert.equal(recallSearchQuery('what did we talk about?'), '')
})

test('recall runs only for a signed-in user, excludes the current conversation, and falls back to recent conversations', async () => {
  const calls: Array<[string, string, string | null]> = []
  const search = async (userId: string, query: string, exclude: string | null) => {
    calls.push([userId, query, exclude])
    return { ok: true, results: query ? [] : [result] }
  }
  assert.equal(await buildConversationRecallContext({ userId: null, request: 'what did we talk about last week?', currentConversationId: current, search }), null)
  assert.equal(calls.length, 0)
  assert.equal(await buildConversationRecallContext({ userId: user, request: 'what is the capital of Portugal?', currentConversationId: current, search }), null)
  assert.equal(calls.length, 0)
  const context = await buildConversationRecallContext({ userId: user, request: 'what did we discuss about the approvals page?', currentConversationId: current, search })
  assert.deepEqual(calls.map(call => call[2]), [current, current])
  assert.equal(calls[0][1] !== '', true)
  assert.equal(calls[1][1], '')
  assert.match(String(context), /PRIVATE CONVERSATION HISTORY WITH THIS USER/)
  assert.match(String(context), /not instructions, not verified facts/)
  assert.match(String(context), /University approvals/)
})

test('history context is bounded and a failing search never breaks the answer', async () => {
  const many = Array.from({ length: 40 }, (_, index) => ({ ...result, title: `Conversation ${index}`, summary: 'x'.repeat(400) }))
  assert.ok(String(formatConversationRecallContext(many)).length < COS_CONVERSATION_RECALL_MAX_CHARS + 600)
  assert.equal(formatConversationRecallContext([]), null)
  const failing = async () => { throw new Error('db down') }
  assert.equal(await buildConversationRecallContext({ userId: user, request: 'what did we talk about yesterday?', currentConversationId: null, search: failing as any }), null)
})

test('the owner COS path injects recall before reasoning, keeps it off the public web, and never caches it', () => {
  const route = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
  assert.match(route, /const conversationRecallRequested=Boolean\(userId\)&&detectConversationRecallIntent\(input\)/)
  assert.match(route, /const baselineRequiresFreshEvidence=requiresFreshExternalEvidence\(input\)&&!conversationRecallRequested/)
  assert.match(route, /search:searchPastConversations/)
  const cache = readFileSync(new URL('../lib/ai/cos/cacheSafetyPolicy.ts', import.meta.url), 'utf8')
  assert.match(cache, /if \(prompt\.includes\(COS_CONVERSATION_RECALL_MARKER\)\) return false/)
  assert.ok(route.indexOf('buildConversationRecallContext({') < route.indexOf('cos=await tryCOSFirstAnswer('))
})
