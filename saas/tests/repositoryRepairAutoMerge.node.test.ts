// saas/tests/repositoryRepairAutoMerge.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { repositoryChangeDangerCategory } from '../lib/builder/repository-change-danger-policy.ts'
import { attemptSignalBoostRepositoryAutoMerge, evaluateAutoMergeDangerCategory } from '../lib/builder/repository-repair-automerge.ts'
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

test('an ordinary repair with a restorable checkpoint merges and returns the pre-merge snapshot id', async () => {
  const calls: Array<{ url: string; method: string }> = []
  const request = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input)
    const method = String(init.method || 'GET')
    calls.push({ url, method })
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
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'PUT')
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
