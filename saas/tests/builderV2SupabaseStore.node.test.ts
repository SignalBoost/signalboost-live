import test from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createBuilderV2SupabaseLeaseStore } from '../lib/builder/agent-v2-supabase-store.ts'

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
