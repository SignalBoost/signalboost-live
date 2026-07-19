import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  parseOperationsIntelligenceSnapshot,
  SupabaseOperationsSnapshotStore,
} from '../lib/enterprise/operations/operationsSnapshotStore.ts'

const validSnapshot = {
  organizationId: 'org-1',
  generatedAt: '2026-07-19T02:00:00.000Z',
  health: { state: 'green', score: 100 },
  incidents: {},
  verification: {},
  learning: {},
  playbooks: {},
  recentIncidentIds: ['incident-1'],
}

test('operations snapshot parser accepts the canonical read-only snapshot shape', () => {
  assert.deepEqual(parseOperationsIntelligenceSnapshot(validSnapshot), validSnapshot)
})

test('operations snapshot parser fails closed on malformed persisted data', () => {
  assert.throws(() => parseOperationsIntelligenceSnapshot(null), /must be an object/)
  assert.throws(() => parseOperationsIntelligenceSnapshot({ ...validSnapshot, organizationId: ' ' }), /organizationId/)
  assert.throws(() => parseOperationsIntelligenceSnapshot({ ...validSnapshot, generatedAt: 'invalid' }), /generatedAt/)
  assert.throws(() => parseOperationsIntelligenceSnapshot({ ...validSnapshot, health: { state: 'unknown', score: 100 } }), /health/)
  assert.throws(() => parseOperationsIntelligenceSnapshot({ ...validSnapshot, recentIncidentIds: [1] }), /recentIncidentIds/)
})

test('Supabase snapshot store scopes reads to one organization and returns the latest snapshot', async () => {
  const calls: Array<[string, unknown]> = []
  const query = {
    select(value: string) { calls.push(['select', value]); return this },
    eq(column: string, value: string) { calls.push(['eq', [column, value]]); return this },
    order(column: string, options: unknown) { calls.push(['order', [column, options]]); return this },
    limit(value: number) { calls.push(['limit', value]); return this },
    async maybeSingle() { calls.push(['maybeSingle', true]); return { data: { snapshot: validSnapshot }, error: null } },
  }
  const client = { from(table: string) { calls.push(['from', table]); return query } } as unknown as SupabaseClient

  const result = await new SupabaseOperationsSnapshotStore(client).getLatest(' org-1 ')
  assert.deepEqual(result, validSnapshot)
  assert.deepEqual(calls, [
    ['from', 'enterprise_operations_snapshots'],
    ['select', 'snapshot'],
    ['eq', ['organization_id', 'org-1']],
    ['order', ['generated_at', { ascending: false }]],
    ['limit', 1],
    ['maybeSingle', true],
  ])
})

test('Supabase snapshot store rejects blank scope and sanitizes storage failures', async () => {
  const client = {
    from() {
      return {
        select() { return this },
        eq() { return this },
        order() { return this },
        limit() { return this },
        async maybeSingle() { return { data: null, error: { message: 'database unavailable' } } },
      }
    },
  } as unknown as SupabaseClient
  const store = new SupabaseOperationsSnapshotStore(client)
  await assert.rejects(() => store.getLatest('   '), /organizationId is required/)
  await assert.rejects(() => store.getLatest('org-1'), /Unable to load operations snapshot: database unavailable/)
})

test('operations snapshot migration keeps browser roles fully blocked', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20260719_enterprise_operations_snapshots.sql', import.meta.url), 'utf8')
  assert.match(sql, /enable row level security/i)
  assert.match(sql, /revoke all on table public\.enterprise_operations_snapshots from anon, authenticated/i)
  assert.match(sql, /grant select, insert on table public\.enterprise_operations_snapshots to service_role/i)
  assert.doesNotMatch(sql, /grant\s+(select|insert|update|delete)[^;]*to\s+(anon|authenticated)/i)
  assert.match(sql, /snapshot ->> 'organizationId' = organization_id/)
  assert.match(sql, /snapshot ->> 'generatedAt'/)
})
