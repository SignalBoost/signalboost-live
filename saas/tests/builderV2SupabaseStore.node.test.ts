import test from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createBuilderV2SupabaseLeaseStore, pauseBuilderV2Job } from '../lib/builder/agent-v2-supabase-store.ts'

const USER = '11111111-1111-4111-8111-111111111111'
const JOB = '22222222-2222-4222-8222-222222222222'

test('V2 store reads only explicit engine=v2 running claims and fences writes', async () => {
  const filters: Array<[string, unknown]> = []
  const query: Record<string, any> = {
    select() { return this },
    update() { return this },
    eq(key: string, value: unknown) { filters.push([key, value]); return this },
    contains(key: string, value: unknown) { filters.push([key, value]); return this },
    async maybeSingle() { return { data: { workspace_id: JOB, objective: 'build', claim_generation: 3, checkpoint: null }, error: null } },
    then(resolve: (value: unknown) => void) { resolve({ data: [{ id: JOB }], error: null }) },
  }
  const db = { from(table: string) { assert.equal(table, 'builder_jobs'); return query } } as unknown as SupabaseClient
  const store = createBuilderV2SupabaseLeaseStore(db, USER)
  const loaded = await store.load(JOB)
  assert.equal(loaded?.claimGeneration, 3)
  const saved = await store.save(JOB, 3, { version: 2, workspaceId: JOB,
    objectiveDigest: 'a', workspaceDigest: 'b', steps: [], revision: 0,
    verifiedRevision: -1, unproductive: 0, lastReceipt: '' })
  assert.equal(saved, true)
  assert.ok(filters.some(([k, v]) => k === 'status' && v === 'running'))
  assert.ok(filters.some(([k, v]) => k === 'claim_generation' && v === 3))
  assert.ok(filters.some(([k, v]) => k === 'metadata' && (v as any).builderEngine === 'v2'))
})

test('V2 store never reads malformed job identifiers', async () => {
  const db = { from() { throw Error('must not query') } } as unknown as SupabaseClient
  const store = createBuilderV2SupabaseLeaseStore(db, USER)
  assert.equal(await store.load('../legacy'), null)
  assert.equal(await store.save('../legacy', 1, { version: 2, workspaceId: 'w',
    objectiveDigest: 'a', workspaceDigest: 'b', steps: [],
    revision: 0, verifiedRevision: -1, unproductive: 0, lastReceipt: '' }), false)
})

const v2Checkpoint = { version: 2 as const, workspaceId: JOB, objectiveDigest: 'a', workspaceDigest: 'b', steps: [],
  revision: 0, verifiedRevision: -1, unproductive: 0, lastReceipt: '' }

function recordingDb(jobRows: unknown[]) {
  const calls: Array<{ table: string; op: string; args: unknown[] }> = []
  const db = { from(table: string) {
    const query: Record<string, any> = {
      update(values: unknown) { calls.push({ table, op: 'update', args: [values] }); return this },
      select(columns: unknown) { calls.push({ table, op: 'select', args: [columns] }); return this },
      eq(key: string, value: unknown) { calls.push({ table, op: 'eq', args: [key, value] }); return this },
      lt(key: string, value: unknown) { calls.push({ table, op: 'lt', args: [key, value] }); return this },
      contains(key: string, value: unknown) { calls.push({ table, op: 'contains', args: [key, value] }); return this },
      then(resolve: (value: unknown) => void) { resolve({ data: table === 'builder_jobs' ? jobRows : null, error: null }) },
    }
    return query
  } } as unknown as SupabaseClient
  return { db, calls }
}

test('production 2026-10-16: a V2 checkpoint pauses with the same fences as the V1 pause function', async () => {
  const MESSAGE = '33333333-3333-4333-8333-333333333333'
  const { db, calls } = recordingDb([{ id: JOB, history_message_id: MESSAGE, conversation_id: JOB, workspace_id: JOB }])
  const paused = await pauseBuilderV2Job(db, { jobId: JOB, userId: USER, claimGeneration: 5, checkpoint: v2Checkpoint,
    reply: 'Builder V2 saved its progress', result: { status: 'paused' } })
  assert.equal(paused, true)
  const job = calls.filter(call => call.table === 'builder_jobs')
  assert.equal((job[0].args[0] as any).status, 'paused')
  assert.equal((job[0].args[0] as any).checkpoint.version, 2)
  const has = (op: string, key: string, value: unknown) => job.some(call => call.op === op && call.args[0] === key
    && JSON.stringify(call.args[1]) === JSON.stringify(value))
  assert.ok(has('eq', 'status', 'running'))
  assert.ok(has('eq', 'claim_generation', 5))
  assert.ok(has('lt', 'claim_generation', 24))
  assert.ok(has('eq', 'job_kind', 'standard'))
  assert.ok(has('eq', 'workspace_id', JOB))
  assert.ok(has('contains', 'metadata', { builderEngine: 'v2' }))
  const message = calls.find(call => call.table === 'assistant_messages' && call.op === 'update')
  assert.equal((message?.args[0] as any).provenance.status, 'paused')
  assert.ok(calls.some(call => call.table === 'assistant_messages' && call.op === 'eq' && call.args[1] === MESSAGE))
})

test('a stale claim or reached slice cap does not pause and does not touch history', async () => {
  const { db, calls } = recordingDb([])
  assert.equal(await pauseBuilderV2Job(db, { jobId: JOB, userId: USER, claimGeneration: 24, checkpoint: v2Checkpoint,
    reply: 'r', result: {} }), false)
  assert.ok(!calls.some(call => call.table === 'assistant_messages'))
  assert.equal(await pauseBuilderV2Job(db, { jobId: JOB, userId: USER, claimGeneration: 2,
    checkpoint: { ...v2Checkpoint, version: 1 } as never, reply: 'r', result: {} }), false)
})
