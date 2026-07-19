import assert from 'node:assert/strict'
import test from 'node:test'
import type { ClosedLoopVerificationResult } from '../lib/enterprise/memory/closedLoopVerification.ts'
import type { OrganizationalRepairLearning } from '../lib/enterprise/memory/organizationalLearning.ts'
import type { EnterprisePlaybookRegistry } from '../lib/enterprise/memory/playbookIntelligence.ts'
import type { OperationsIncident, OperationsIntelligenceSnapshot } from '../lib/enterprise/operations/operationsIntelligence.ts'
import {
  OperationsSnapshotProducer,
  type OperationsSnapshotSource,
  type OperationsSnapshotWriter,
} from '../lib/enterprise/operations/operationsSnapshotProducer.ts'

const organizationId = 'org-1'
const generatedAt = '2026-07-19T03:00:00.000Z'

const incidents: readonly OperationsIncident[] = [{
  incidentId: 'incident-1',
  organizationId,
  severity: 'high',
  status: 'verification_pending',
  openedAt: '2026-07-19T01:00:00.000Z',
  updatedAt: '2026-07-19T02:00:00.000Z',
}]

const verifications: readonly ClosedLoopVerificationResult[] = [{
  organizationId,
  targetEventId: 'event-1',
  status: 'verified',
  confidence: 0.9,
  checks: [],
  verifiedChecks: [],
  failedChecks: [],
  missingChecks: [],
  recommendation: 'request_incident_closure_approval',
  unknowns: [],
}]

const learning: OrganizationalRepairLearning = {
  organizationId,
  acceptedSamples: [],
  ignoredOutcomeCount: 0,
  strategies: [],
}

const playbooks: EnterprisePlaybookRegistry = {
  organizationId,
  incidentClass: 'deployment',
  versions: [],
  current: [],
}

function source(overrides: Partial<OperationsSnapshotSource> = {}): OperationsSnapshotSource {
  return {
    async loadIncidents(id) {
      assert.equal(id, organizationId)
      return incidents
    },
    async loadVerifications(id) {
      assert.equal(id, organizationId)
      return verifications
    },
    async loadLearning(id) {
      assert.equal(id, organizationId)
      return learning
    },
    async loadPlaybooks(id) {
      assert.equal(id, organizationId)
      return playbooks
    },
    ...overrides,
  }
}

test('producer loads governed sources, builds one snapshot, and persists it', async () => {
  let persisted: OperationsIntelligenceSnapshot | undefined
  const writer: OperationsSnapshotWriter = {
    async save(snapshot) {
      persisted = snapshot
      return snapshot
    },
  }

  const result = await new OperationsSnapshotProducer(source(), writer).produce({
    organizationId: ` ${organizationId} `,
    generatedAt,
  })

  assert.equal(result, persisted)
  assert.equal(result.organizationId, organizationId)
  assert.equal(result.generatedAt, generatedAt)
  assert.equal(result.incidents.total, 1)
  assert.equal(result.verification.verified, 1)
})

test('producer is deterministic for the same governed inputs and generatedAt', async () => {
  const saved: OperationsIntelligenceSnapshot[] = []
  const writer: OperationsSnapshotWriter = {
    async save(snapshot) {
      saved.push(snapshot)
      return snapshot
    },
  }
  const producer = new OperationsSnapshotProducer(source(), writer)

  const first = await producer.produce({ organizationId, generatedAt })
  const second = await producer.produce({ organizationId, generatedAt })

  assert.deepEqual(second, first)
  assert.equal(saved.length, 2)
  assert.equal(saved[0].organizationId, saved[1].organizationId)
  assert.equal(saved[0].generatedAt, saved[1].generatedAt)
})

test('producer rejects blank organization IDs before loading sources', async () => {
  let loaded = false
  const guardedSource = source({
    async loadIncidents() {
      loaded = true
      return []
    },
  })

  await assert.rejects(
    () => new OperationsSnapshotProducer(guardedSource, { save: async snapshot => snapshot }).produce({ organizationId: '   ' }),
    /requires organizationId/,
  )
  assert.equal(loaded, false)
})

test('producer rejects cross-organization source data', async () => {
  const mismatchedLearning = { ...learning, organizationId: 'org-2' }
  await assert.rejects(
    () => new OperationsSnapshotProducer(
      source({ async loadLearning() { return mismatchedLearning } }),
      { save: async snapshot => snapshot },
    ).produce({ organizationId, generatedAt }),
    /learning organization mismatch/,
  )
})

test('producer fails closed when writer changes snapshot identity', async () => {
  await assert.rejects(
    () => new OperationsSnapshotProducer(source(), {
      async save(snapshot) {
        return { ...snapshot, generatedAt: '2026-07-19T04:00:00.000Z' }
      },
    }).produce({ organizationId, generatedAt }),
    /mismatched snapshot identity/,
  )
})
