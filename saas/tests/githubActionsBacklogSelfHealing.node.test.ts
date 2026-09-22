import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

import { runGitHubActionsBacklogRemediation } from '../self-healing-host/github-actions-backlog-remediation.ts'

const MAIN = '1111111111111111111111111111111111111111'
const PR_TIP = '2222222222222222222222222222222222222222'
const OLD_MAIN = '3333333333333333333333333333333333333333'
const OLD_PR = '4444444444444444444444444444444444444444'
const YOUNG = '5555555555555555555555555555555555555555'

function json(value: unknown, status = 200) {
  return Response.json(value, { status })
}

test('out-of-band Actions remediation preserves current authority and cancels only proven stale revisions', async () => {
  const cancelled: number[] = []
  const nowMs = Date.parse('2026-09-22T15:00:00.000Z')
  const old = '2026-09-22T14:00:00.000Z'
  const young = '2026-09-22T14:57:00.000Z'

  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/git/ref/heads/main')) return json({ object: { sha: MAIN } })

    if (url.pathname.endsWith('/actions/runs')) {
      if (url.searchParams.get('status') === 'queued') {
        return json({ workflow_runs: [
          { id: 1, name: 'main-current', head_branch: 'main', head_sha: MAIN, created_at: old },
          { id: 2, name: 'pr-current', head_branch: 'fix/example', head_sha: PR_TIP, created_at: old },
          { id: 3, name: 'main-stale', head_branch: 'main', head_sha: OLD_MAIN, created_at: old },
          { id: 4, name: 'pr-stale', head_branch: 'fix/example', head_sha: OLD_PR, created_at: old },
          { id: 5, name: 'young-stale-main', head_branch: 'main', head_sha: YOUNG, created_at: young },
        ] })
      }
      return json({ workflow_runs: [] })
    }

    if (url.pathname.endsWith('/pulls')) {
      return json([{ head: { ref: 'fix/example', sha: PR_TIP } }])
    }

    const cancel = url.pathname.match(/\/actions\/runs\/(\d+)\/cancel$/)
    if (cancel) {
      cancelled.push(Number(cancel[1]))
      return new Response(null, { status: 202 })
    }

    throw new Error(`unexpected request: ${url.pathname}${url.search}`)
  }

  const result = await runGitHubActionsBacklogRemediation({
    env: {
      GITHUB_WRITE_TOKEN: 'test-token',
      GITHUB_REPOSITORY: 'SignalBoost/signalboost-live',
    },
    fetcher,
    nowMs,
    minAgeMs: 10 * 60_000,
  })

  assert.equal(result.ok, true)
  assert.equal(result.mode, 'active')
  assert.equal(result.scanned, 5)
  assert.equal(result.eligible, 2)
  assert.equal(result.cancelled, 2)
  assert.equal(result.preserved, 3)
  assert.deepEqual(cancelled.sort((a, b) => a - b), [3, 4])
})

test('out-of-band Actions remediation fails closed when the backend write credential is absent', async () => {
  let contacted = false
  const result = await runGitHubActionsBacklogRemediation({
    env: { GITHUB_REPOSITORY: 'SignalBoost/signalboost-live' },
    fetcher: async () => {
      contacted = true
      throw new Error('must not contact GitHub')
    },
  })

  assert.equal(result.ok, false)
  assert.equal(result.mode, 'missing_credential')
  assert.equal(contacted, false)
  assert.equal(result.cancelled, 0)
})

test('GitHub backlog remediation is hosted by the five-minute GitHub cron, not the broad monitor', async () => {
  const githubRoute = await readFile(new URL('../app/api/cron/github-observation/route.ts', import.meta.url), 'utf8')
  const nativeRoute = await readFile(new URL('../app/api/cron/native-proactive-monitoring/route.ts', import.meta.url), 'utf8')
  const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))

  assert.match(githubRoute, /runGitHubActionsBacklogRemediation/)
  assert.match(githubRoute, /actionsBacklogPromise/)
  assert.match(githubRoute, /coordination_unavailable[\s\S]*actionsBacklog/)
  assert.doesNotMatch(nativeRoute, /runGitHubActionsBacklogRemediation/)
  assert.deepEqual(
    vercel.crons.find((item: { path: string }) => item.path === '/api/cron/github-observation'),
    { path: '/api/cron/github-observation', schedule: '2,7,12,17,22,27,32,37,42,47,52,57 * * * *' },
  )
})

test('out-of-band Actions remediation force-cancels a proven stale run after normal cancel returns 409', async () => {
  const calls: string[] = []
  const nowMs = Date.parse('2026-09-22T15:00:00.000Z')
  const old = '2026-09-22T14:00:00.000Z'

  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input))
    calls.push(url.pathname)

    if (url.pathname.endsWith('/git/ref/heads/main')) return json({ object: { sha: MAIN } })
    if (url.pathname.endsWith('/actions/runs')) {
      if (url.searchParams.get('status') === 'queued') {
        return json({ workflow_runs: [
          { id: 9, name: 'stuck-old-run', head_branch: 'fix/closed-stale', head_sha: OLD_PR, created_at: old },
        ] })
      }
      return json({ workflow_runs: [] })
    }
    if (url.pathname.endsWith('/pulls')) return json([])
    if (url.pathname.endsWith('/git/ref/heads/fix%2Fclosed-stale')) {
      return json({ object: { sha: OLD_PR } })
    }
    if (url.pathname.endsWith('/actions/runs/9/cancel')) {
      return json({ message: 'Conflict' }, 409)
    }
    if (url.pathname.endsWith('/actions/runs/9/force-cancel')) {
      return new Response(null, { status: 202 })
    }
    throw new Error(`unexpected request: ${url.pathname}${url.search}`)
  }

  const result = await runGitHubActionsBacklogRemediation({
    env: {
      GITHUB_WRITE_TOKEN: 'test-token',
      GITHUB_REPOSITORY: 'SignalBoost/signalboost-live',
    },
    fetcher,
    nowMs,
    minAgeMs: 10 * 60_000,
  })

  assert.equal(result.ok, true)
  assert.equal(result.eligible, 1)
  assert.equal(result.cancelled, 1)
  assert.equal(result.raced, 0)
  assert.deepEqual(
    calls.filter(path => path.includes('/actions/runs/9/')),
    [
      '/repos/SignalBoost/signalboost-live/actions/runs/9/cancel',
      '/repos/SignalBoost/signalboost-live/actions/runs/9/force-cancel',
    ],
  )
})
