import assert from 'node:assert/strict'
import test from 'node:test'
import { supervisorDiagnosticCacheKey } from '../lib/autonomous-supervisor/diagnostic-cache-key.ts'

test('same detection attempt reuses the same Supervisor diagnostic cache identity', () => {
  const incident = { incident_id: 'incident-stable-fingerprint', timestamp: '2026-08-15T17:00:00.000Z' }
  assert.equal(supervisorDiagnosticCacheKey(incident), supervisorDiagnosticCacheKey({ ...incident }))
})

test('later detection of the same incident fingerprint gets a different diagnostic cache identity', () => {
  const first = supervisorDiagnosticCacheKey({ incident_id: 'incident-stable-fingerprint', timestamp: '2026-08-15T17:00:00.000Z' })
  const later = supervisorDiagnosticCacheKey({ incident_id: 'incident-stable-fingerprint', timestamp: '2026-08-15T18:00:00.000Z' })
  assert.notEqual(first, later)
})

test('attempt identity fails closed when the detection timestamp is missing', () => {
  assert.throws(
    () => supervisorDiagnosticCacheKey({ incident_id: 'incident-stable-fingerprint', timestamp: '' }),
    /detection timestamp/,
  )
})
