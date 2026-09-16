// saas/tests/conciergeConversationResume.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CONCIERGE_RESUME_KEYS,
  CONCIERGE_RESUME_MAX_MESSAGES,
  loadResumableConversation,
  pairResumedTurns,
  resumableMessages,
} from '../lib/concierge/conversationResume.ts'

const id = '11111111-2222-4333-8444-555555555555'
const file = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

test('each Concierge surface keeps its own conversation id, never the dashboard history', () => {
  assert.notEqual(CONCIERGE_RESUME_KEYS.homepage, CONCIERGE_RESUME_KEYS.dock)
})

test('a signed-in owner of the conversation gets the transcript back, paired into turns', async () => {
  let url = ''
  const messages = await loadResumableConversation(id, (async (input: any) => {
    url = String(input)
    return json(200, { messages: [
      { role: 'user', content: 'what is the capital of Portugal?' },
      { role: 'assistant', content: 'Lisbon.' },
      { role: 'system', content: 'ignored' },
      { role: 'user', content: 'and Spain?' },
    ] })
  }) as typeof fetch)
  assert.equal(url, `/api/assistant/chats?id=${id}`)
  assert.deepEqual(pairResumedTurns(messages!), [{ request: 'what is the capital of Portugal?', response: 'Lisbon.' }])
})

test('anonymous, missing, empty or failing reads never resume', async () => {
  assert.equal(await loadResumableConversation(id, (async () => json(401, { error: 'Not authenticated' })) as typeof fetch), null)
  assert.equal(await loadResumableConversation(id, (async () => json(200, { conversation: null, messages: [], missing: true })) as typeof fetch), null)
  assert.equal(await loadResumableConversation(id, (async () => json(200, { messages: [] })) as typeof fetch), null)
  assert.equal(await loadResumableConversation(id, (async () => { throw new Error('offline') }) as typeof fetch), null)
  assert.equal(await loadResumableConversation('not-a-uuid', (async () => json(200, { messages: [{ role: 'user', content: 'x' }] })) as typeof fetch), null)
})

test('resume is bounded to the most recent messages', () => {
  const many = Array.from({ length: 100 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `m${index}` }))
  const kept = resumableMessages(many)
  assert.equal(kept.length, CONCIERGE_RESUME_MAX_MESSAGES)
  assert.equal(kept[kept.length - 1].content, 'm99')
})

test('homepage and dock remember the id when a conversation starts, restore on return, and forget on New chat', () => {
  const home = file('app/page.tsx')
  assert.match(home, /rememberResumeId\(CONCIERGE_RESUME_KEYS\.homepage, conversationIdRef\.current\)/)
  assert.match(home, /loadResumableConversation\(resumeId\)/)
  assert.match(home, /setTurns\(\(current\) => current\.length \? current : restored\)/)
  assert.match(home, /function startNewChat\(\) \{\s*forgetResumeId\(CONCIERGE_RESUME_KEYS\.homepage\)/)
  const dock = file('components/Concierge.tsx')
  assert.match(dock, /rememberResumeId\(CONCIERGE_RESUME_KEYS\.dock, conversationIdRef\.current\)/)
  assert.match(dock, /loadResumableConversation\(resumeId\)/)
  assert.match(dock, /forgetResumeId\(CONCIERGE_RESUME_KEYS\.dock\)\s*conversationIdRef\.current = ''/)
})
