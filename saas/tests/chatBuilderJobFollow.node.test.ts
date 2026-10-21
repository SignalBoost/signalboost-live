// saas/tests/chatBuilderJobFollow.node.test.ts
//
// Production 2026-10-21: the Builder acceptance test sent from chat showed only "COS Builder is running job …".
// Chat followed a Builder job for 180 checks (~4.5 minutes) and then kept that running line as its final answer,
// while the job went on for several more minutes. Chat now follows a job for its whole lifetime, like the
// Developer page, and shows the job's own final result.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { postWithAgentProgress } from '../lib/ai/cos/agentProgressClient.ts'
import { BUILDER_JOB_FOLLOW_WINDOW_MS, BUILDER_JOB_POLL_DELAY_MS } from '../lib/builder/job-poll.ts'

// Simulated clock: every wait advances time by its delay and resolves at once.
function simulatedBrowser(jobRunsForMs: number) {
  let now = Date.parse('2026-10-21T17:00:00Z')
  const realNow = Date.now
  Date.now = () => now
  const original = { window: (globalThis as any).window, fetch: globalThis.fetch }
  ;(globalThis as any).window = {
    setTimeout: (fn: () => void, ms: number) => { now += ms; return setTimeout(fn, 0) },
    clearTimeout: (id: any) => clearTimeout(id),
    setInterval: () => 0,
    clearInterval: () => undefined,
  }
  const startedAt = now
  let statusChecks = 0
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith('/api/assistant/chats')) return Response.json({ error: 'not found' }, { status: 404 })
    if (url.startsWith('/api/builder?jobId=')) {
      statusChecks += 1
      return now - startedAt < jobRunsForMs
        ? Response.json({ jobId: 'job-1', status: 'running', reply: 'COS Builder is running job job-1.' }, { status: 202 })
        : Response.json({ jobId: 'job-1', status: 'succeeded', reply: 'Builder V2 verified the workspace.' })
    }
    if (init?.method === 'POST') return Response.json({ jobId: 'job-1', status: 'queued', reply: 'COS Builder is running job job-1.' }, { status: 202 })
    return Response.json({}, { status: 404 })
  }) as typeof fetch
  return {
    checks: () => statusChecks,
    restore: () => { Date.now = realNow; (globalThis as any).window = original.window; globalThis.fetch = original.fetch },
  }
}

const body = { messages: [{ role: 'user', content: 'Fix the Failed to fetch error on the Builder page' }], context: {} }

test('a job that runs for 8 minutes ends with its own final result, not the running line', async () => {
  const browser = simulatedBrowser(8 * 60_000)
  try {
    const result = await postWithAgentProgress({ target: 'cos', body, signal: new AbortController().signal, onProgress: () => undefined })
    assert.equal(result.data.reply, 'Builder V2 verified the workspace.')
    assert.equal(result.ok, true)
    assert.ok(browser.checks() > 180, `followed past the old 180-check limit (${browser.checks()} checks)`)
  } finally { browser.restore() }
})

test('following stops at the job lifetime window and points to History', async () => {
  const browser = simulatedBrowser(BUILDER_JOB_FOLLOW_WINDOW_MS + 60_000)
  try {
    const result = await postWithAgentProgress({ target: 'cos', body, signal: new AbortController().signal, onProgress: () => undefined })
    assert.equal(result.status, 202)
    assert.ok(browser.checks() <= BUILDER_JOB_FOLLOW_WINDOW_MS / BUILDER_JOB_POLL_DELAY_MS + 1)
  } finally { browser.restore() }
})

test('chat and the Developer page share one follow window', () => {
  const client = readFileSync(new URL('../lib/ai/cos/agentProgressClient.ts', import.meta.url), 'utf8')
  assert.match(client, /const followUntil = Date\.now\(\) \+ BUILDER_JOB_FOLLOW_WINDOW_MS/)
  assert.doesNotMatch(client, /JOB_POLL_ATTEMPTS/)
})
