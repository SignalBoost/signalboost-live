import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DecisionGraph,
  DependencyKnowledgeGraph,
  DryRunEngine,
  PostgresQuorumStateStore,
  PostgresMerkleAuditStore,
  type SqlClient,
  type EnterpriseProviderDescriptor,
} from '../lib/supervisor/enterprise-runtime/index.ts'
import { MerkleAuditLedger } from '../lib/supervisor/kernel/merkle-audit-ledger.ts'
import type { AuditEvent } from '../lib/supervisor/execution-contracts.ts'
import type { QuorumState } from '../lib/supervisor/kernel/quorum-approval.ts'

class MemorySqlClient implements SqlClient {
  readonly calls: Array<{ sql: string; params?: unknown[] }> = []
  quorum = new Map<string, QuorumState>()
  auditCount = 0
  frontier = new Map<number, string>()

  async query<Row = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: Row[] }> {
    this.calls.push({ sql, params })
    if (sql.startsWith('SELECT state FROM supervisor_quorum_requests')) {
      const state = this.quorum.get(String(params?.[0]))
      return { rows: (state ? [{ state }] : []) as Row[] }
    }
    if (sql.startsWith('INSERT INTO supervisor_quorum_requests')) {
      this.quorum.set(String(params?.[0]), JSON.parse(String(params?.[1])) as QuorumState)
      return { rows: [] }
    }
    if (sql.startsWith('DELETE FROM supervisor_quorum_requests')) {
      this.quorum.delete(String(params?.[0]))
      return { rows: [] }
    }
    if (sql.startsWith('SELECT COUNT(*)')) return { rows: [{ count: String(this.auditCount) }] as Row[] }
    if (sql.startsWith('SELECT node_hash FROM supervisor_merkle_frontier')) {
      const hash = this.frontier.get(Number(params?.[0]))
      return { rows: (hash ? [{ node_hash: hash }] : []) as Row[] }
    }
    if (sql.startsWith('DELETE FROM supervisor_merkle_frontier')) {
      this.frontier.delete(Number(params?.[0]))
      return { rows: [] }
    }
    if (sql.startsWith('INSERT INTO supervisor_merkle_frontier')) {
      this.frontier.set(Number(params?.[0]), String(params?.[1]))
      return { rows: [] }
    }
    if (sql.startsWith('SELECT level, node_hash FROM supervisor_merkle_frontier')) {
      const rows = [...this.frontier.entries()].sort((a, b) => a[0] - b[0]).map(([level, node_hash]) => ({ level, node_hash }))
      return { rows: rows as Row[] }
    }
    if (sql.startsWith('INSERT INTO supervisor_audit_events')) {
      this.auditCount += 1
      return { rows: [] }
    }
    return { rows: [] }
  }
}

test('dependency knowledge graph uses buyer policy floors instead of hardcoded risk thresholds', () => {
  const graph = new DependencyKnowledgeGraph()
  graph.register({ serviceId: 'checkout', environment: 'production', isDatabase: false, criticality: 'critical', downstreamDependencies: ['payments'] })
  graph.register({ serviceId: 'payments', environment: 'production', isDatabase: true, criticality: 'important', downstreamDependencies: [] })
  const result = graph.analyze('checkout', {
    mediumAtAffectedCount: 3,
    highAtAffectedCount: 5,
    criticalAtAffectedCount: 10,
    productionRiskFloor: 'medium',
    databaseRiskFloor: 'high',
    criticalServiceRiskFloor: 'critical',
  })
  assert.deepEqual(result.affectedServices, ['checkout', 'payments'])
  assert.equal(result.databaseInvolved, true)
  assert.equal(result.riskLevel, 'critical')
})

test('dry-run engine always restores the shadow snapshot after mutation', async () => {
  const calls: string[] = []
  const provider: EnterpriseProviderDescriptor = {
    providerType: 'test-cloud',
    planner: { validatePlan: async () => ({ allowed: true, reason: 'ok' }) },
    snapshots: { checkpoint: async target => ({ snapshotId: 'snap-1', providerType: 'test-cloud', targetResourceUrn: target, codeState: {}, schemaState: {}, capturedAt: new Date().toISOString() }) },
    mutations: { execute: async () => { calls.push('execute'); return { success: true } } },
    verification: { verify: async () => ({ healthy: true, metrics: { ready: 1 }, assertionFailures: [] }) },
    rollback: { rollback: async () => { calls.push('rollback'); return { restored: true } } },
  }
  const result = await new DryRunEngine().simulate({ requestId: 'r1', targetResourceUrn: 'svc:checkout', params: {} }, provider)
  assert.equal(result.passedSimulation, true)
  assert.deepEqual(calls, ['execute', 'rollback'])
})

test('decision graph preserves evidence-to-action relationships deterministically', () => {
  const graph = new DecisionGraph('incident-1')
  graph.addNode({ nodeId: 'e1', kind: 'evidence', label: '503 alert', timestamp: '2026-08-07T12:00:00Z', data: {} })
  graph.addNode({ nodeId: 'd1', kind: 'diagnosis', label: 'availability failure', timestamp: '2026-08-07T12:00:01Z', data: {} })
  graph.addNode({ nodeId: 'p1', kind: 'policy', label: 'approval required', timestamp: '2026-08-07T12:00:02Z', data: {} })
  graph.link({ from: 'e1', to: 'd1', relation: 'supports' })
  graph.link({ from: 'd1', to: 'p1', relation: 'derived_from' })
  const snapshot = graph.snapshot()
  assert.equal(snapshot.nodes.length, 3)
  assert.deepEqual(snapshot.edges.map(edge => edge.relation), ['derived_from', 'supports'])
})

test('postgres quorum state store round-trips quorum state', async () => {
  const db = new MemorySqlClient()
  const store = new PostgresQuorumStateStore(db)
  const state: QuorumState = {
    request: {
      requestId: 'q1', incidentId: 'i1', planId: 'p1', planFingerprint: 'f'.repeat(64), policyVersion: 'v1', targetEnvironment: 'production', approvedStepIds: ['s1'], nonce: 'n1',
      createdAt: '2026-08-07T12:00:00Z', expiresAt: '2026-08-07T13:00:00Z', quorumPolicy: { requiredSignaturesCount: 2, requiredRoles: ['ON_CALL_LEAD', 'SECURITY_OFFICER'], ttlMs: 3600000 },
    },
    signatures: [], satisfied: false,
  }
  await store.put(state)
  assert.deepEqual(await store.get('q1'), state)
  await store.delete('q1')
  assert.equal(await store.get('q1'), undefined)
})

test('persistent Merkle frontier matches the canonical in-memory ledger including odd leaves', async () => {
  const db = new MemorySqlClient()
  const store = new PostgresMerkleAuditStore(db)
  const reference = new MerkleAuditLedger()
  const event = (id: string): AuditEvent => ({ eventId: id, incidentId: 'i1', eventType: 'incident_received', occurredAt: '2026-08-07T12:00:00Z', payload: {}, schemaVersion: 'v1' })
  let persistentRoot = ''
  for (const id of ['e1', 'e2', 'e3']) {
    persistentRoot = (await store.append(event(id))).merkleRoot
    await reference.append(event(id))
  }
  assert.equal(persistentRoot, reference.rootHash())
  assert.equal(db.calls.some(call => call.sql.includes('SELECT leaf_hash FROM supervisor_audit_events')), false)
  assert.equal(db.calls.some(call => call.sql.includes('pg_advisory_xact_lock')), true)
})
