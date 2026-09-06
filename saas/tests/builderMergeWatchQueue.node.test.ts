// saas/tests/builderMergeWatchQueue.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runPendingMergeWatches, MERGE_WATCH_MAX_ATTEMPTS } from '../lib/builder/merge-watch-runner.ts'
import type { PendingMergeWatch } from '../lib/builder/merge-watch-store.ts'

function pending(overrides: Partial<PendingMergeWatch> = {}): PendingMergeWatch {
  return Object.freeze({
    id: 'row_1',
    workspaceId: 'workspace_1',
    userId: 'user_1',
    mergeCommitSha: 'a'.repeat(40),
    preMergeSnapshotId: 'dpl_previous',
    pullRequestNumber: 42,
    attempts: 1,
    ...overrides,
  })
}

function store(rows: readonly PendingMergeWatch[]) {
  const closed: Array<{ id: string; status: string; detail: string }> = []
  return {
    closed,
    store: {
      claim: async () => rows,
      close: async (id: string, status: any, detail: string) => { closed.push({ id, status, detail }) },
      record: async () => {},
    },
  }
}

function outcome(kind: 'healthy' | 'rolled_back' | 'unresolved', detail = 'detail') {
  return { outcome: kind, deploymentId: 'dpl_new', deploymentState: 'X', rollbackTargetId: 'dpl_previous', detail }
}

test('a healthy deployment closes the row and nothing else happens', async () => {
  const s = store([pending()])
  const sweep = await runPendingMergeWatches({ store: s.store as any, watch: async () => outcome('healthy') as any })
  assert.equal(sweep.healthy, 1)
  assert.equal(sweep.stillPending, 0)
  assert.deepEqual(s.closed.map(c => c.status), ['healthy'])
})

test('a rolled-back deployment closes the row as rolled_back', async () => {
  const s = store([pending()])
  const sweep = await runPendingMergeWatches({ store: s.store as any, watch: async () => outcome('rolled_back') as any })
  assert.equal(sweep.rolledBack, 1)
  assert.deepEqual(s.closed.map(c => c.status), ['rolled_back'])
})

test('an unresolved deployment stays pending for the next tick and is NOT closed', async () => {
  const s = store([pending({ attempts: 2 })])
  const sweep = await runPendingMergeWatches({ store: s.store as any, watch: async () => outcome('unresolved') as any })
  assert.equal(sweep.stillPending, 1)
  assert.equal(sweep.abandoned, 0)
  assert.equal(s.closed.length, 0)
})

test('the attempt budget abandons the row and names the rollback target', async () => {
  const s = store([pending({ attempts: MERGE_WATCH_MAX_ATTEMPTS })])
  const sweep = await runPendingMergeWatches({ store: s.store as any, watch: async () => outcome('unresolved') as any })
  assert.equal(sweep.abandoned, 1)
  assert.equal(s.closed[0].status, 'abandoned')
  assert.match(s.closed[0].detail, /dpl_previous/)
  assert.match(s.closed[0].detail, /a{40}/)
})

test('a throwing check is unresolved, never a rollback, and never closes the row', async () => {
  const s = store([pending({ attempts: 1 })])
  const sweep = await runPendingMergeWatches({
    store: s.store as any,
    watch: async () => { throw new Error('vercel unreachable') },
  })
  assert.equal(sweep.stillPending, 1)
  assert.equal(sweep.rolledBack, 0)
  assert.equal(s.closed.length, 0)
})

test('one unjudgeable row does not stop the others in the same sweep', async () => {
  const s = store([pending({ id: 'row_1' }), pending({ id: 'row_2' }), pending({ id: 'row_3' })])
  let call = 0
  const sweep = await runPendingMergeWatches({
    store: s.store as any,
    watch: async () => {
      call += 1
      if (call === 2) throw new Error('boom')
      return outcome(call === 1 ? 'healthy' : 'rolled_back') as any
    },
  })
  assert.equal(sweep.claimed, 3)
  assert.equal(sweep.healthy, 1)
  assert.equal(sweep.rolledBack, 1)
  assert.equal(sweep.stillPending, 1)
})

test('the runner attempt ceiling matches the database constraint', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20260906000000_builder_merge_watches.sql', import.meta.url), 'utf8')
  assert.match(sql, new RegExp(`attempts between 0 and ${MERGE_WATCH_MAX_ATTEMPTS}`))
  assert.match(sql, new RegExp(`attempts < ${MERGE_WATCH_MAX_ATTEMPTS}`))
  // Repair jobs stay excluded from the job checkpoint rail; this table is why that is fine.
  assert.match(sql, /enable row level security/)
  assert.match(sql, /unique index[\s\S]*merge_commit_sha\) where status = 'pending'/)
})

test('the cron accepts no request-supplied work and requires the shared secret', () => {
  const route = readFileSync(new URL('../app/api/cron/builder-merge-watch/route.ts', import.meta.url), 'utf8')
  assert.match(route, /CRON_SECRET/)
  assert.match(route, /status: 401/)
  assert.doesNotMatch(route, /request\.json|searchParams/)
})
