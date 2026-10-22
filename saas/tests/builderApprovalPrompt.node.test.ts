// saas/tests/builderApprovalPrompt.node.test.ts
//
// Owner, 2026-10-22: "If users must prompt something, like your 'go', the system should let the user know that it is
// waiting for a prompt from the user to continue. The only way I knew to say go was because you told me so."
// A paused Work with me job now shows as an approval card in every chat, with a button that sends the approval word
// in the user's language; a job waiting for approval is shown at once instead of being polled as if still running.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  APPROVAL_BODY, APPROVAL_BUTTON, APPROVAL_HINT, APPROVAL_TITLE, APPROVAL_WORD, isAssistanceApproval, readPendingApproval,
} from '../lib/ai/cos/assistanceMode.ts'
import { postWithAgentProgress } from '../lib/ai/cos/agentProgressClient.ts'
import { SUPPORTED_LANGUAGES } from '../lib/i18n/supportedLanguages.ts'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('the button word approves in every language, and every card text exists in all 11', () => {
  for (const lang of SUPPORTED_LANGUAGES) {
    assert.equal(isAssistanceApproval(APPROVAL_WORD[lang]), true, `${lang}: ${APPROVAL_WORD[lang]}`)
    for (const copy of [APPROVAL_TITLE, APPROVAL_HINT, APPROVAL_BODY.isolated_publication, APPROVAL_BODY.repository_merge,
      APPROVAL_BUTTON.isolated_publication, APPROVAL_BUTTON.repository_merge]) assert.ok(copy[lang]?.trim(), `${lang}: ${copy.en}`)
    assert.match(APPROVAL_HINT[lang], /\{word\}/, lang)
  }
  assert.deepEqual(readPendingApproval({ awaitingApproval: { action: 'isolated_publication', fingerprint: 'x' } }), { action: 'isolated_publication' })
  assert.deepEqual(readPendingApproval({ awaitingApproval: { action: 'repository_merge', pullRequestNumber: 7 } }), { action: 'repository_merge' })
  assert.equal(readPendingApproval({ awaitingApproval: { action: 'delete_everything' } }), null)
  assert.equal(readPendingApproval({ status: 'succeeded' }), null)
})

// A held live-site repair leaves its job paused (merge pending). Chat used to keep polling a paused job for up to 30
// minutes; a job waiting for the user is now shown immediately.
test('chat stops following a job that is waiting for the user and returns it for the approval card', async () => {
  let now = Date.parse('2026-10-22T13:10:00Z')
  const realNow = Date.now
  Date.now = () => now
  const original = { window: (globalThis as any).window, fetch: globalThis.fetch }
  ;(globalThis as any).window = { setTimeout: (fn: () => void, ms: number) => { now += ms; return setTimeout(fn, 0) },
    clearTimeout: (id: any) => clearTimeout(id), setInterval: () => 0, clearInterval: () => undefined }
  let polls = 0
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith('/api/assistant/chats')) return Response.json({}, { status: 404 })
    if (url.startsWith('/api/builder?jobId=')) {
      polls += 1
      return Response.json({ jobId: 'job-3', status: 'paused', reply: 'PR #4800 created; merge held.',
        awaitingApproval: { action: 'repository_merge', pullRequestNumber: 4800 } }, { status: 202 })
    }
    if (init?.method === 'POST') return Response.json({ jobId: 'job-3', status: 'queued', reply: 'running' }, { status: 202 })
    return Response.json({}, { status: 404 })
  }) as typeof fetch
  try {
    const result = await postWithAgentProgress({ target: 'cos', signal: new AbortController().signal, onProgress: () => undefined,
      body: { messages: [{ role: 'user', content: 'Fix the Failed to fetch error on the Builder page' }], context: { conversationId: '44444444-4444-4444-8444-444444444444' } } })
    assert.deepEqual(readPendingApproval(result.data), { action: 'repository_merge' })
    assert.equal(polls, 1, 'shown on the first status read, not polled for half an hour')
  } finally {
    Date.now = realNow; (globalThis as any).window = original.window; globalThis.fetch = original.fetch
  }
})

test('every chat shows the card under its latest reply and the button sends the word through the normal send', () => {
  for (const [path, loop, send] of [
    ['app/page.tsx', /index === turns\.length - 1 && turn\.approval/, /onApprove=\{\(word\) => void ask\(word\)\}/],
    ['app/dashboard/assistant/page.tsx', /msg\.approval && i === messages\.length - 1/, /onApprove=\{word => void send\(word\)\}/],
    ['components/Concierge.tsx', /message\.approval && index === visibleMessages\.length - 1/, /onApprove=\{word => ask\(word\)\}/],
  ] as const) {
    const page = read(path)
    assert.match(page, loop, path)
    assert.match(page, send, path)
    assert.match(page, /readPendingApproval\((?:payload|data)\)/, path)
  }
  const prompt = read('components/ApprovalPrompt.tsx')
  assert.match(prompt, /onClick=\{\(\) => onApprove\(word\)\}/)
  // Both kinds of pause carry the marker the card reads.
  assert.match(read('lib/builder/job-runner.ts'), /awaitingApproval: \{ action: 'isolated_publication', fingerprint/)
  assert.match(read('lib/builder/repository-repair.ts'), /input\.holdMerge === true && writeback\.stage === 'pr_created' && writeback\.pullRequestNumber\n\s*\? \{ awaitingApproval: \{ action: 'repository_merge'/)
})
