import assert from 'node:assert/strict'
import test from 'node:test'

import { createClusterRuntimeHealthEvidenceManifest } from '../agent-gateway/cluster-runtime-health-evidence-manifest.ts'
import type { ClusterRuntimeHealthExportBundle } from '../agent-gateway/cluster-runtime-health-export.ts'

const generatedAt = '2026-07-26T00:00:00.000Z'
const safety = Object.freeze({ readOnly: true as const, advisoryOnly: true as const, automaticRetryEnabled: false as const, automaticRepairEnabled: false as const, infrastructureMutationEnabled: false as const })
const bundle = Object.freeze({
  schemaVersion: 'agent-gateway-cluster-runtime-health-export-v1' as const,
  exportId: `gateway-east:${generatedAt}:deadbeef`,
  clusterId: 'gateway-east',
  generatedAt,
  integrity: Object.freeze({ algorithm: 'fnv1a-32' as const, digest: 'deadbeef', canonical: true as const }),
  dashboard: Object.freeze({ schemaVersion: 'agent-gateway-cluster-runtime-health-dashboard-v1' as const }),
  timelineSummary: Object.freeze({ transitionCount: 0, statuses: Object.freeze(['healthy']), recentTransitionIds: Object.freeze([]) }),
  trend: Object.freeze({ schemaVersion: 'agent-gateway-cluster-runtime-health-trend-v1' as const }),
  forecast: Object.freeze({ schemaVersion: 'agent-gateway-cluster-runtime-health-forecast-v1' as const }),
  recommendations: Object.freeze({ schemaVersion: 'agent-gateway-cluster-runtime-health-recommendations-v1' as const }),
  safety,
  executable: false as const,
}) as unknown as ClusterRuntimeHealthExportBundle

test('creates deterministic immutable evidence manifests', () => {
  const first = createClusterRuntimeHealthEvidenceManifest(bundle)
  const second = createClusterRuntimeHealthEvidenceManifest(bundle)
  assert.deepEqual(first, second)
  assert.equal(first.references.length, 6)
  assert.deepEqual(first.references.map(reference => reference.kind), ['dashboard', 'export', 'forecast', 'recommendations', 'timeline-summary', 'trend'])
  assert.equal(Object.isFrozen(first), true)
  assert.equal(first.executable, false)
})

test('fails closed for schema, safety, identity, and integrity violations', () => {
  assert.throws(() => createClusterRuntimeHealthEvidenceManifest({ ...bundle, schemaVersion: 'bad' } as unknown as ClusterRuntimeHealthExportBundle), /invalid/)
  assert.throws(() => createClusterRuntimeHealthEvidenceManifest({ ...bundle, executable: true } as unknown as ClusterRuntimeHealthExportBundle), /unsafe/)
  assert.throws(() => createClusterRuntimeHealthEvidenceManifest({ ...bundle, clusterId: '' } as ClusterRuntimeHealthExportBundle), /identity/)
  assert.throws(() => createClusterRuntimeHealthEvidenceManifest({ ...bundle, integrity: { ...bundle.integrity, digest: 'bad' } } as ClusterRuntimeHealthExportBundle), /integrity/)
})
