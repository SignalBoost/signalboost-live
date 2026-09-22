import assert from 'node:assert/strict'
import test from 'node:test'

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
