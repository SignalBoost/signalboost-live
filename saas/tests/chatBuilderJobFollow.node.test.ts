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
    // Like the browser: an aborted request rejects.
    if (init?.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
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

// Codex on #4739: the owner Assistant page aborts its request after 290 s. That deadline bounds the request, not
// the accepted job; the page clears it once the job is accepted, and Stop still aborts.
test('a caller deadline that is cleared on job acceptance does not cut the job short; Stop still does', async () => {
  for (const stopAtMs of [null, 60_000] as const) {
    const browser = simulatedBrowser(8 * 60_000)
    try {
      const controller = new AbortController()
      const startedAt = Date.now()
      let deadlineArmed = true
      const run = postWithAgentProgress({
        target: 'cos', body, signal: controller.signal,
        onJobAccepted: () => { deadlineArmed = false },
        onProgress: () => {
          const elapsed = Date.now() - startedAt
          if (deadlineArmed && elapsed > 290_000) controller.abort()
          if (stopAtMs !== null && elapsed > stopAtMs) controller.abort()
        },
      })
      if (stopAtMs === null) assert.equal((await run).data.reply, 'Builder V2 verified the workspace.')
      else await assert.rejects(run, (error: Error) => error.name === 'AbortError')
    } finally { browser.restore() }
  }
  const page = readFileSync(new URL('../app/dashboard/assistant/page.tsx', import.meta.url), 'utf8')
  assert.match(page, /const deadline = setTimeout\(\(\) => \{ hitDeadline = true; controller\.abort\(\) \}, CLIENT_DEADLINE_MS\)/)
  assert.match(page, /onJobAccepted: \(\) => clearTimeout\(deadline\)/)
})

test('chat and the Developer page share one follow window', () => {
  const client = readFileSync(new URL('../lib/ai/cos/agentProgressClient.ts', import.meta.url), 'utf8')
  assert.match(client, /const followUntil = Date\.now\(\) \+ BUILDER_JOB_FOLLOW_WINDOW_MS/)
  assert.doesNotMatch(client, /JOB_POLL_ATTEMPTS/)
})

test('chat follows a job for as long as the job may run, so the result comes back to the chat', async () => {
  // Production 2026-10-23: the chat stopped following after 30 minutes while a job may run 60, and the person was told
  // to look for the result in History.
  const { BUILDER_JOB_TOTAL_DEADLINE_MS } = await import('../lib/builder/work-budget.ts')
  assert.ok(BUILDER_JOB_FOLLOW_WINDOW_MS > BUILDER_JOB_TOTAL_DEADLINE_MS)
  const { BUILDER_RUNNING } = await import('../lib/ai/cos/assistanceMode.ts')
  for (const sentence of Object.values(BUILDER_RUNNING)) assert.doesNotMatch(sentence, /History|Historial|Histórico|Historii|Истори|Verlauf|Historique|Cronologia|履歴|기록|السجل/)
})
