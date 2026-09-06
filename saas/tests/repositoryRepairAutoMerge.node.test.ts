// saas/tests/repositoryRepairAutoMerge.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { repositoryChangeDangerCategory } from '../lib/builder/repository-change-danger-policy.ts'
import { attemptSignalBoostRepositoryAutoMerge, evaluateAutoMergeDangerCategory } from '../lib/builder/repository-repair-automerge.ts'
import { completePendingRepositoryRepairMerges, REPOSITORY_REPAIR_AUTOMERGE_MARKER } from '../lib/builder/repository-repair-merge-continuation.ts'
import type { StateSnapshotPort } from '../lib/portable/state-snapshot-port.ts'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function fakePort(overrides: Partial<StateSnapshotPort> = {}): StateSnapshotPort {
  return {
    capabilities: () => [],
    capture: async () => ({
      ok: true,
      snapshot: { snapshotId: 'dpl_good', scope: 'deployment', provider: 'vercel', capturedAt: new Date().toISOString(), restorable: true },
    }),
    restore: async () => ({ ok: true, restoredAt: new Date().toISOString() }),
    ...overrides,
  }
}

test('financial paths and diff content are classified and never eligible', () => {
  assert.equal(repositoryChangeDangerCategory([{ path: 'lib/billing/invoice.ts', content: '' }], ''), 'financial')
  assert.equal(repositoryChangeDangerCategory([{ path: 'lib/x.ts', content: '' }], '+const chargeStripeCustomer = () => {}'), 'financial')
  const verdict = evaluateAutoMergeDangerCategory([{ path: 'lib/billing/invoice.ts', content: '' }], '')
  assert.equal(verdict.eligible, false)
})

test('credential/secrets paths and diff content are classified, and outrank financial when both match', () => {
  assert.equal(repositoryChangeDangerCategory([{ path: 'lib/auth/session.ts', content: '' }], ''), 'credential_security')
  assert.equal(repositoryChangeDangerCategory([{ path: 'lib/x.ts', content: '' }], '+const STRIPE_SECRET_KEY = process.env.X'), 'credential_security')
})

test('an ordinary logic change is not classified as dangerous', () => {
  assert.equal(repositoryChangeDangerCategory([{ path: 'lib/demo/rounding.ts', content: '' }], '+  return roundHalfUp(value)'), null)
})

test('auto-merge refuses on a danger category before ever touching the snapshot port or GitHub', async () => {
  let captureCalled = false
  const port = fakePort({ capture: async () => { captureCalled = true; return { ok: true, snapshot: { snapshotId: 'x', scope: 'deployment', provider: 'vercel', capturedAt: '', restorable: true } } } })
  const result = await attemptSignalBoostRepositoryAutoMerge({
    files: [{ path: 'lib/billing/invoice.ts', content: '' }],
    patch: '',
    pullRequestNumber: 1,
    snapshotPort: port,
    request: (async () => { throw new Error('must not call GitHub') }) as typeof fetch,
  })
  assert.equal(result.merged, false)
  assert.equal(result.reason, 'danger_category')
  assert.equal(result.dangerCategory, 'financial')
  assert.equal(captureCalled, false)
})

test('auto-merge refuses with no snapshot port configured', async () => {
  const result = await attemptSignalBoostRepositoryAutoMerge({
    files: [{ path: 'lib/demo/rounding.ts', content: '' }],
    patch: '',
    pullRequestNumber: 1,
    snapshotPort: null,
  })
  assert.equal(result.merged, false)
  assert.equal(result.reason, 'snapshot_capture_failed')
})

test('auto-merge refuses when capture fails, and never calls GitHub', async () => {
  const port = fakePort({ capture: async () => ({ ok: false, error: 'Vercel returned HTTP 500' }) })
  const result = await attemptSignalBoostRepositoryAutoMerge({
    files: [{ path: 'lib/demo/rounding.ts', content: '' }],
    patch: '',
    pullRequestNumber: 1,
    snapshotPort: port,
    request: (async () => { throw new Error('must not call GitHub') }) as typeof fetch,
  })
  assert.equal(result.merged, false)
  assert.equal(result.reason, 'snapshot_capture_failed')
  assert.match(String(result.detail), /HTTP 500/)
})

test('auto-merge refuses when the captured snapshot is not restorable — no checkpoint, no pre-authorized merge', async () => {
  const port = fakePort({
    capture: async () => ({ ok: true, snapshot: { snapshotId: 'dpl_frozen', scope: 'deployment', provider: 'vercel', capturedAt: '', restorable: false } }),
  })
  const result = await attemptSignalBoostRepositoryAutoMerge({
    files: [{ path: 'lib/demo/rounding.ts', content: '' }],
    patch: '',
    pullRequestNumber: 1,
    snapshotPort: port,
    request: (async () => { throw new Error('must not call GitHub') }) as typeof fetch,
  })
  assert.equal(result.merged, false)
  assert.equal(result.reason, 'snapshot_not_restorable')
  assert.match(String(result.detail), /dpl_frozen/)
})

const greenChecks = (url: string, headSha: string) => {
  if (url.endsWith('/pulls/1842')) return jsonResponse({ head: { sha: headSha } })
  if (url.includes(`/commits/${headSha}/check-runs`)) return jsonResponse({ check_runs: [{ name: 'build', status: 'completed', conclusion: 'success' }] })
  if (url.endsWith(`/commits/${headSha}/status`)) return jsonResponse({ state: 'success', statuses: [{ state: 'success' }] })
  return null
}

test('an ordinary repair with a restorable checkpoint and green checks merges with a two-parent merge method', async () => {
  const headSha = 'b'.repeat(40)
  const calls: Array<{ url: string; method: string; body: string }> = []
  const request = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input)
    const method = String(init.method || 'GET')
    calls.push({ url, method, body: String(init.body || '') })
    const checks = greenChecks(url, headSha)
    if (checks) return checks
    if (url.endsWith('/pulls/1842/merge') && method === 'PUT') return jsonResponse({ sha: 'a'.repeat(40), merged: true })
    return jsonResponse({ message: 'unexpected request' }, 500)
  }) as typeof fetch

  const result = await attemptSignalBoostRepositoryAutoMerge({
    files: [{ path: 'lib/demo/rounding.ts', content: '' }],
    patch: '+  return roundHalfUp(value)',
    pullRequestNumber: 1842,
    snapshotPort: fakePort(),
    request,
    token: 'server-write-token',
  })

  assert.equal(result.merged, true)
  assert.equal(result.reason, null)
  assert.equal(result.preMergeSnapshotId, 'dpl_good')
  assert.equal(result.mergeCommitSha, 'a'.repeat(40))
  const writes = calls.filter(call => call.method === 'PUT')
  assert.equal(writes.length, 1)
  assert.equal(writes[0].url.endsWith('/pulls/1842/merge'), true)
  assert.deepEqual(JSON.parse(writes[0].body), { merge_method: 'merge' })
})

test('an unchecked or failing head refuses the merge and never sends the PUT', async () => {
  const headSha = 'c'.repeat(40)
  for (const [label, runs] of [
    ['no checks at all', []],
    ['a failing check', [{ name: 'build', status: 'completed', conclusion: 'failure' }]],
    ['an unfinished check', [{ name: 'build', status: 'in_progress', conclusion: null }]],
  ] as Array<[string, unknown[]]>) {
    const calls: Array<{ url: string; method: string }> = []
    const request = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input)
      calls.push({ url, method: String(init.method || 'GET') })
      if (url.endsWith('/pulls/1842')) return jsonResponse({ head: { sha: headSha } })
      if (url.includes(`/commits/${headSha}/check-runs`)) return jsonResponse({ check_runs: runs })
      if (url.endsWith(`/commits/${headSha}/status`)) return jsonResponse({ state: '', statuses: [] })
      return jsonResponse({ message: 'unexpected request' }, 500)
    }) as typeof fetch

    const result = await attemptSignalBoostRepositoryAutoMerge({
      files: [{ path: 'lib/demo/rounding.ts', content: '' }],
      patch: '+  return roundHalfUp(value)',
      pullRequestNumber: 1842,
      snapshotPort: fakePort(),
      request,
      token: 'server-write-token',
    })

    assert.equal(result.merged, false, label)
    assert.equal(result.reason, 'checks_not_green', label)
    assert.equal(calls.some(call => call.method === 'PUT'), false, label)
  }
})

test('a missing write token refuses without attempting the GitHub merge call', async () => {
  const result = await attemptSignalBoostRepositoryAutoMerge({
    files: [{ path: 'lib/demo/rounding.ts', content: '' }],
    patch: '',
    pullRequestNumber: 1,
    snapshotPort: fakePort(),
    request: (async () => { throw new Error('must not call GitHub') }) as typeof fetch,
    token: '',
  })
  assert.equal(result.merged, false)
})

test('durable continuation merges only the exact server-created repair PR after CI is green', async () => {
  const oldEnabled = process.env.BUILDER_AUTO_MERGE_ENABLED
  const oldVercelToken = process.env.VERCEL_TOKEN
  const oldProject = process.env.VERCEL_PROJECT_ID
  process.env.BUILDER_AUTO_MERGE_ENABLED = 'true'
  process.env.VERCEL_TOKEN = ''
  process.env.VERCEL_PROJECT_ID = ''
  try {
    const headSha = 'd'.repeat(40)
    const mergeSha = 'e'.repeat(40)
    const calls: Array<{ url: string; method: string }> = []
    const request = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input)
      const method = String(init.method || 'GET')
      calls.push({ url, method })
      if (url.includes('/pulls?state=open&base=main')) return jsonResponse([
        {
          number: 1842,
          title: 'COS Platform Engineer: verified repository repair',
          body: `${REPOSITORY_REPAIR_AUTOMERGE_MARKER}\n\nPinned base: abc`,
          base: { ref: 'main' },
          head: { ref: 'cos/platform-repair-1234abcd-a1b2c3d4e5', sha: headSha, repo: { full_name: 'SignalBoost/signalboost-live' } },
        },
        {
          number: 1843,
          title: 'Ordinary human PR',
          body: REPOSITORY_REPAIR_AUTOMERGE_MARKER,
          base: { ref: 'main' },
          head: { ref: 'feature/not-a-repair', sha: headSha, repo: { full_name: 'SignalBoost/signalboost-live' } },
        },
      ])
      if (url.endsWith('/pulls/1842/files?per_page=100')) return jsonResponse([{ filename: 'saas/lib/demo/rounding.ts', patch: '+  return roundHalfUp(value)' }])
      if (url.endsWith('/pulls/1842')) return jsonResponse({ head: { sha: headSha } })
      if (url.includes(`/commits/${headSha}/check-runs`)) return jsonResponse({ check_runs: [{ name: 'SaaS CI', status: 'completed', conclusion: 'success' }] })
      if (url.endsWith(`/commits/${headSha}/status`)) return jsonResponse({ state: 'success', statuses: [{ state: 'success' }] })
      if (url.endsWith('/pulls/1842/merge') && method === 'PUT') return jsonResponse({ sha: mergeSha, merged: true })
      return jsonResponse({ message: `unexpected ${method} ${url}` }, 500)
    }) as typeof fetch

    const result = await completePendingRepositoryRepairMerges({
      request,
      token: 'server-write-token',
      snapshotPort: fakePort(),
      deadlineAtMs: Date.now() + 60_000,
    })
    assert.equal(result.enabled, true)
    assert.equal(result.candidates, 1)
    assert.equal(result.merged, 1)
    assert.equal(result.pending, 0)
    assert.equal(result.outcomes[0]?.pullRequestNumber, 1842)
    assert.equal(result.outcomes[0]?.mergeCommitSha, mergeSha)
    assert.equal(calls.some(call => call.url.includes('/pulls/1843/')), false)
  } finally {
    if (oldEnabled === undefined) delete process.env.BUILDER_AUTO_MERGE_ENABLED
    else process.env.BUILDER_AUTO_MERGE_ENABLED = oldEnabled
    if (oldVercelToken === undefined) delete process.env.VERCEL_TOKEN
    else process.env.VERCEL_TOKEN = oldVercelToken
    if (oldProject === undefined) delete process.env.VERCEL_PROJECT_ID
    else process.env.VERCEL_PROJECT_ID = oldProject
  }
})

test('merge continuation is cron-authenticated, minute-scheduled, and controlled by the server kill switch', async () => {
  const [route, vercel, continuation] = await Promise.all([
    readFile(new URL('../app/api/cron/builder-repair-merge/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../vercel.json', import.meta.url), 'utf8'),
    readFile(new URL('../lib/builder/repository-repair-merge-continuation.ts', import.meta.url), 'utf8'),
  ])
  assert.match(route, /CRON_SECRET/)
  assert.match(route, /completePendingRepositoryRepairMerges/)
  assert.match(vercel, /"\/api\/cron\/builder-repair-merge"[\s\S]*"\* \* \* \* \*"/)
  assert.match(continuation, /BUILDER_AUTO_MERGE_ENABLED/)
  assert.match(continuation, /evaluateAutoMergeDangerCategory/)
  assert.match(continuation, /evaluatePullRequestChecks/)
  assert.match(continuation, /builderAutoMergeSnapshotPort/)
})
