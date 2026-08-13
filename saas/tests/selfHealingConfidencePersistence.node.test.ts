import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAssessmentConfidenceIncident } from '../self-healing-host/assessment-confidence-monitoring'
import { PERSISTENCE_PROBE_ID, PERSISTENCE_PROBE_TARGET, PersistenceHealthObserver } from '../self-healing-host/native-persistence-monitoring'

const context: any = { provider: 'signalboost-platform', environment: 'production' }

test('confidence deficit becomes an evidence-rich preventive incident', () => {
  const incident = buildAssessmentConfidenceIncident({
    confidence: 89,
    detectedAt: '2026-08-13T06:30:00.000Z',
    fingerprint: 'abcdef0123456789abcdef0123456789',
    reasons: [
      { code: 'missed_observations', label: 'One expected observation window was missed', penalty: 7, why: 'Observation was owed.', remedy: 'Run the next observation.' },
      { code: 'unmeasured_domains', label: '1 domain(s) have no independent signal', penalty: 4, why: 'Persistence is not measured.', remedy: 'Collect a persistence signal.' },
    ],
  })
  assert.equal(incident.errorCode, 'supervisor_observation_confidence_gap')
  assert.equal(incident.metadata?.confidence, 89)
  assert.equal(incident.evidence.length, 2)
  assert.match(incident.evidence[0].summary, /-7/)
})

test('persistence observer proves insert then separate read before marking evidence healthy', async () => {
  const rows = new Map<number, any>()
  let nextId = 1
  const db = {
    from(table: string) {
      assert.equal(table, 'self_healing_native_probe_samples')
      return {
        insert(row: any) {
          const id = nextId++
          rows.set(id, { ...row, id })
          return { select: () => ({ single: async () => ({ data: { id }, error: null }) }) }
        },
        select: () => ({
          eq: (_field: string, id: number) => ({
            maybeSingle: async () => ({ data: rows.get(id) ?? null, error: null }),
          }),
        }),
        update(patch: any) {
          return {
            eq: async (_field: string, id: number) => {
              rows.set(id, { ...rows.get(id), ...patch })
              return { error: null }
            },
          }
        },
      }
    },
  }

  const observer = new PersistenceHealthObserver({ db, now: () => new Date('2026-08-13T06:30:00.000Z'), warningLatencyMs: 999999 })
  const incidents = await observer.observe(context)
  assert.equal(incidents.length, 0)
  assert.equal(rows.size, 1)
  const row = [...rows.values()][0]
  assert.equal(row.probe_id, PERSISTENCE_PROBE_ID)
  assert.equal(row.target, PERSISTENCE_PROBE_TARGET)
  assert.equal(row.status, 'healthy')
  assert.equal(row.details.verification, 'read_back_verified')
})

test('persistence observer never leaves healthy evidence when separate read does not match', async () => {
  const rows = new Map<number, any>()
  const db = {
    from() {
      return {
        insert(row: any) {
          rows.set(1, { ...row, id: 1 })
          return { select: () => ({ single: async () => ({ data: { id: 1 }, error: null }) }) }
        },
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 1, details: { nonce: 'wrong' } }, error: null }) }) }),
        update(patch: any) { return { eq: async () => { rows.set(1, { ...rows.get(1), ...patch }); return { error: null } } } },
      }
    },
  }
  const incidents = await new PersistenceHealthObserver({ db, now: () => new Date('2026-08-13T06:30:00.000Z') }).observe(context)
  assert.equal(incidents.length, 1)
  assert.equal(incidents[0].errorCode, 'native_persistence_roundtrip_failed')
  assert.notEqual(rows.get(1).status, 'healthy')
})
