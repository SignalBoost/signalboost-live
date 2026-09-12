import test from 'node:test'
import assert from 'node:assert/strict'
import { A2A_RUNTIME_OBSERVATION_VERSION } from '../a2a-host/a2a-runtime-observability.ts'
import { createProductionSpecialistMeshSignalPort, createProductionSpecialistQualificationPort } from '../a2a-host/specialist-mesh-production-adapters.ts'

const scope = { tenantId: 'tenant-1', environmentId: 'production', portableId: 'cos', skillId: 'self-healing.diagnose', agentIds: ['a', 'b'] as const }

test('production qualification adapter fails closed and preserves exact scope', async () => {
  const port = createProductionSpecialistQualificationPort({
    async read() {
      return [
        { ...scope, agentId: 'a', qualified: true, evidenceRef: 'university:credential:a:1' },
        { ...scope, agentId: 'b', qualified: true, evidenceRef: '' },
        { ...scope, agentId: 'c', qualified: true, evidenceRef: 'other' },
        { ...scope, portableId: 'other', agentId: 'b', qualified: true, evidenceRef: 'wrong-scope' },
      ]
    },
  })
  assert.deepEqual(await port.snapshot(scope), { a: { qualified: true, evidenceRef: 'university:credential:a:1' } })
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
