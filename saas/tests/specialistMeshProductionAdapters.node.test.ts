import test from 'node:test'
import assert from 'node:assert/strict'
import { A2A_RUNTIME_OBSERVATION_VERSION } from '../a2a-host/a2a-runtime-observability.ts'
import { createProductionSpecialistMeshSignalPort, createProductionSpecialistQualificationPort, createSupabaseSpecialistMeshProductionAdapters } from '../a2a-host/specialist-mesh-production-adapters.ts'

const scope = { tenantId: 'tenant-1', environmentId: 'production', portableId: 'cos', skillId: 'self-healing.diagnose', agentIds: ['a', 'b'] as const }

test('production qualification adapter fails closed and latest exact-scope decision wins', async () => {
  const port = createProductionSpecialistQualificationPort({
    async read() {
      return [
        { ...scope, agentId: 'a', qualified: false, evidenceRef: 'revoked:a', observedAt: '2026-09-12T20:00:00Z' },
        { ...scope, agentId: 'a', qualified: true, evidenceRef: 'older:a', observedAt: '2026-09-12T19:00:00Z' },
        { ...scope, agentId: 'b', qualified: true, evidenceRef: 'credential:b', observedAt: '2026-09-12T20:00:00Z' },
        { ...scope, agentId: 'c', qualified: true, evidenceRef: 'other' },
        { ...scope, portableId: 'other', agentId: 'b', qualified: true, evidenceRef: 'wrong-scope' },
      ]
    },
  })
  assert.deepEqual(await port.snapshot(scope), { b: { qualified: true, evidenceRef: 'credential:b' } })
})

test('production telemetry adapter ranks only scoped fresh metadata evidence', async () => {
  const now = Date.parse('2026-09-12T20:00:00Z')
  const port = createProductionSpecialistMeshSignalPort({
    now: () => now,
    windowMs: 15 * 60_000,
    observations: {
      async read() {
        return [
          { schemaVersion: A2A_RUNTIME_OBSERVATION_VERSION, eventId: '1', occurredAt: '2026-09-12T19:59:00Z', durationMs: 3000, tenantId: 'tenant-1', environmentId: 'production', portableId: 'cos', agentId: 'a', skillId: 'self-healing.diagnose', ok: true, mode: 'delegated' },
          { schemaVersion: A2A_RUNTIME_OBSERVATION_VERSION, eventId: '2', occurredAt: '2026-09-12T19:58:00Z', durationMs: 9000, tenantId: 'tenant-1', environmentId: 'production', portableId: 'cos', agentId: 'a', skillId: 'self-healing.diagnose', ok: false, mode: 'a2a_transport_unavailable' },
          { schemaVersion: A2A_RUNTIME_OBSERVATION_VERSION, eventId: 'old', occurredAt: '2026-09-12T18:00:00Z', durationMs: 1, tenantId: 'tenant-1', environmentId: 'production', portableId: 'cos', agentId: 'a', skillId: 'self-healing.diagnose', ok: true, mode: 'delegated' },
          { schemaVersion: A2A_RUNTIME_OBSERVATION_VERSION, eventId: 'wrong', occurredAt: '2026-09-12T19:59:00Z', durationMs: 1, tenantId: 'other', environmentId: 'production', portableId: 'cos', agentId: 'b', skillId: 'self-healing.diagnose', ok: true, mode: 'delegated' },
        ]
      },
    },
    availability: { async read() { return { a: { available: true, latencyMs: 5000 }, b: { available: false, latencyMs: 1000 } } } },
  })
  const result = await port.snapshot(scope)
  assert.equal(result.a.available, true)
  assert.equal(result.a.reliabilityScore, 50)
  assert.equal(result.a.qualityScore, 50)
  assert.equal(result.a.loadScore, 5)
  assert.equal(result.a.latencyScore, 20)
  assert.deepEqual(result.b, { available: false, latencyScore: 3.333 })
})

test('telemetry outages never grant authority and degrade to neutral evidence', async () => {
  const port = createProductionSpecialistMeshSignalPort({
    observations: { async read() { return [] } },
    availability: { async read() { throw new Error('offline') } },
  })
  assert.deepEqual(await port.snapshot(scope), {})
})

type QueryResult = { data: any[] | null; error: unknown }
function fakeDb(tables: Record<string, QueryResult>) {
  const calls: Array<{ table: string; filters: Array<[string, string, unknown]>; selected: string }> = []
  return {
    calls,
    client: {
      from(table: string) {
        const call = { table, filters: [] as Array<[string, string, unknown]>, selected: '' }; calls.push(call)
        const q: any = {
          select(value: string) { call.selected = value; return q },
          eq(key: string, value: unknown) { call.filters.push(['eq', key, value]); return q },
          in(key: string, value: unknown) { call.filters.push(['in', key, value]); return q },
          lte(key: string, value: unknown) { call.filters.push(['lte', key, value]); return q },
          gt(key: string, value: unknown) { call.filters.push(['gt', key, value]); return q },
          order() { return q },
          limit() { return Promise.resolve(tables[table] ?? { data: [], error: null }) },
        }
        return q
      },
    } as any,
  }
}

test('Supabase qualification adapter consumes durable scoped unexpired decisions only', async () => {
  const db = fakeDb({
    a2a_specialist_qualifications: { data: [
      { agent_id: 'a', skill_id: scope.skillId, qualified: true, evidence_ref: 'db://qualification/a', tenant_id: scope.tenantId, environment_id: scope.environmentId, portable_id: scope.portableId, observed_at: '2026-09-12T20:00:00Z' },
    ], error: null },
  })
  const adapters = createSupabaseSpecialistMeshProductionAdapters(db.client, { now: () => new Date('2026-09-12T20:30:00Z') })
  assert.deepEqual(await adapters.qualifications.snapshot(scope), { a: { qualified: true, evidenceRef: 'db://qualification/a' } })
  const call = db.calls[0]
  assert.equal(call.table, 'a2a_specialist_qualifications')
  assert.ok(call.filters.some(([op, key]) => op === 'gt' && key === 'valid_until'))
  assert.ok(call.filters.some(([op, key]) => op === 'lte' && key === 'valid_from'))
})

test('Supabase telemetry uses newest unexpired row per agent and preserves explicit unavailable', async () => {
  const db = fakeDb({
    a2a_specialist_mesh_telemetry: { data: [
      { agent_id: 'a', available: false, latency_score: 9, cost_score: 12, load_score: 15, reliability_score: 98, quality_score: 97, observed_at: '2026-09-12T20:10:00Z' },
      { agent_id: 'a', available: true, latency_score: 1, cost_score: 1, load_score: 1, reliability_score: 100, quality_score: 100, observed_at: '2026-09-12T20:00:00Z' },
      { agent_id: 'b', available: true, latency_score: 25, cost_score: 20, load_score: 30, reliability_score: 95, quality_score: 96, observed_at: '2026-09-12T20:05:00Z' },
    ], error: null },
  })
  const adapters = createSupabaseSpecialistMeshProductionAdapters(db.client, { now: () => new Date('2026-09-12T20:30:00Z') })
  assert.deepEqual(await adapters.meshSignals.snapshot(scope), {
    a: { available: false, latencyScore: 9, costScore: 12, loadScore: 15, reliabilityScore: 98, qualityScore: 97 },
    b: { available: true, latencyScore: 25, costScore: 20, loadScore: 30, reliabilityScore: 95, qualityScore: 96 },
  })
  assert.ok(db.calls[0].filters.some(([op, key]) => op === 'gt' && key === 'expires_at'))
})

test('Supabase telemetry read error degrades to neutral routing evidence', async () => {
  const db = fakeDb({ a2a_specialist_mesh_telemetry: { data: null, error: new Error('db unavailable') } })
  const adapters = createSupabaseSpecialistMeshProductionAdapters(db.client)
  assert.deepEqual(await adapters.meshSignals.snapshot(scope), {})
})
