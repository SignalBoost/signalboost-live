// saas/tests/repositoryMergeWatch.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { watchMergedDeployment } from '../lib/builder/repository-merge-watch.ts'

const SHA = 'a'.repeat(40)

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function deployments(rows: unknown[]) {
  return (async () => jsonResponse({ deployments: rows })) as unknown as typeof fetch
}

function port(restore: { ok: boolean; error?: string }) {
  const calls: string[] = []
  return {
    calls,
    port: {
      capabilities: () => [],
      capture: async () => ({ ok: false, error: 'not used' }),
      restore: async (snapshot: any) => { calls.push(String(snapshot.snapshotId)); return restore },
    } as any,
  }
}

const base = {
  mergeCommitSha: SHA,
  preMergeSnapshotId: 'dpl_previous',
  projectId: 'prj_1',
  token: 'vercel-token',
}

test('a READY deployment for the merge commit is healthy and never restores', async () => {
  const snapshot = port({ ok: true })
  const result = await watchMergedDeployment({
    ...base,
    snapshotPort: snapshot.port,
    deadlineAtMs: Date.now() + 30_000,
    request: deployments([{ uid: 'dpl_new', readyState: 'READY', meta: { githubCommitSha: SHA.toUpperCase() } }]),
  })
  assert.equal(result.outcome, 'healthy')
  assert.equal(result.deploymentId, 'dpl_new')
  assert.equal(snapshot.calls.length, 0)
})

test('a failed deployment restores the pre-merge checkpoint', async () => {
  const snapshot = port({ ok: true })
  const result = await watchMergedDeployment({
    ...base,
    snapshotPort: snapshot.port,
    deadlineAtMs: Date.now() + 30_000,
    request: deployments([{ uid: 'dpl_new', readyState: 'ERROR', meta: { githubCommitSha: SHA } }]),
  })
  assert.equal(result.outcome, 'rolled_back')
  assert.deepEqual(snapshot.calls, ['dpl_previous'])
  assert.match(result.detail, /auto-assignment/i)
})

test('a failed restore is unresolved and says production is still broken', async () => {
  const snapshot = port({ ok: false, error: 'rollback disabled' })
  const result = await watchMergedDeployment({
    ...base,
    snapshotPort: snapshot.port,
    deadlineAtMs: Date.now() + 30_000,
    request: deployments([{ uid: 'dpl_new', readyState: 'CANCELED', meta: { githubCommitSha: SHA } }]),
  })
  assert.equal(result.outcome, 'unresolved')
  assert.deepEqual(snapshot.calls, ['dpl_previous'])
  assert.match(result.detail, /still on the failed build/i)
})

test('a still-building deployment is unresolved and is NEVER rolled back', async () => {
  const snapshot = port({ ok: true })
  const result = await watchMergedDeployment({
    ...base,
    snapshotPort: snapshot.port,
    deadlineAtMs: Date.now() + 900,
    pollIntervalMs: 20,
    request: deployments([{ uid: 'dpl_new', readyState: 'BUILDING', meta: { githubCommitSha: SHA } }]),
  })
  assert.equal(result.outcome, 'unresolved')
  assert.equal(result.deploymentState, 'BUILDING')
  assert.equal(snapshot.calls.length, 0)
  assert.match(result.detail, /roll back to dpl_previous/)
})

test('another commit deployment is never mistaken for this merge', async () => {
  const snapshot = port({ ok: true })
  const result = await watchMergedDeployment({
    ...base,
    snapshotPort: snapshot.port,
    deadlineAtMs: Date.now() + 900,
    pollIntervalMs: 20,
    request: deployments([{ uid: 'dpl_other', readyState: 'ERROR', meta: { githubCommitSha: 'b'.repeat(40) } }]),
  })
  assert.equal(result.outcome, 'unresolved')
  assert.equal(result.deploymentId, null)
  assert.equal(snapshot.calls.length, 0)
})

test('no remaining time and missing credentials both refuse without calling Vercel', async () => {
  let called = false
  const request = (async () => { called = true; return jsonResponse({}) }) as unknown as typeof fetch

  const noTime = await watchMergedDeployment({ ...base, snapshotPort: null, deadlineAtMs: Date.now() + 100, request })
  assert.equal(noTime.outcome, 'unresolved')

  const noCreds = await watchMergedDeployment({ ...base, token: '', snapshotPort: null, deadlineAtMs: Date.now() + 30_000, request })
  assert.equal(noCreds.outcome, 'unresolved')
  assert.equal(called, false)
  assert.match(noCreds.detail, /dpl_previous/)
})

test('a transport failure never throws and never rolls back', async () => {
  const snapshot = port({ ok: true })
  const request = (async () => { throw new Error('network down') }) as unknown as typeof fetch
  const result = await watchMergedDeployment({
    ...base,
    snapshotPort: snapshot.port,
    deadlineAtMs: Date.now() + 30_000,
    request,
  })
  assert.equal(result.outcome, 'unresolved')
  assert.equal(snapshot.calls.length, 0)
  assert.match(result.detail, /network down/)
})
