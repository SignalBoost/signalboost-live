// saas/agent-gateway/cluster-runtime-health-governance-evidence-catalog.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { createClusterRuntimeHealthGovernanceEvidenceCatalog } from './cluster-runtime-health-governance-evidence-catalog.ts'
import type { ClusterRuntimeHealthGovernanceEvidenceDirectory } from './cluster-runtime-health-governance-evidence-directory.ts'

const generatedAt = '2026-07-26T00:00:00.000Z'

function directory(): ClusterRuntimeHealthGovernanceEvidenceDirectory {
  return {
    schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-directory-v1',
    directoryId: 'cluster-a:directory',
    clusterId: 'cluster-a',
    generatedAt,
    indexId: 'cluster-a:index',
    bundleId: 'cluster-a:bundle',
    manifestId: 'cluster-a:manifest',
    registryId: 'cluster-a:registry',
    catalogId: 'cluster-a:catalog',
    archiveId: 'cluster-a:archive',
    snapshotId: 'cluster-a:snapshot',
    entryCount: 2,
    entries: [
      {
        schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-directory-entry-v1',
        artifactId: 'artifact-b',
        kind: 'governance-registry-manifest',
        schema: 'schema-b',
        generatedAt,
        integrityDigest: '22222222',
        provenance: ['root'],
        retentionClass: 'governance-evidence',
        readOnly: true,
        executable: false,
      },
      {
        schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-directory-entry-v1',
        artifactId: 'artifact-a',
        kind: 'governance-registry',
        schema: 'schema-a',
        generatedAt,
        integrityDigest: '11111111',
        provenance: ['root'],
        retentionClass: 'governance-evidence',
        readOnly: true,
        executable: false,
      },
    ],
    statistics: Object.freeze({}),
    schemaInventory: Object.freeze({}),
    integrity: Object.freeze({ algorithm: 'fnv1a-32', digest: '1234abcd', canonical: true, appendOnlyCompatible: true }),
    retentionClass: 'governance-evidence',
    safety: Object.freeze({ readOnly: true, advisoryOnly: true, automaticRetryEnabled: false, automaticRepairEnabled: false, infrastructureMutationEnabled: false }),
    executable: false,
  }
}

test('creates deterministic immutable evidence catalog', () => {
  const first = createClusterRuntimeHealthGovernanceEvidenceCatalog(directory())
  const second = createClusterRuntimeHealthGovernanceEvidenceCatalog(directory())

  assert.deepEqual(first, second)
  assert.equal(first.entryCount, 3)
  assert.deepEqual(first.entries.map(entry => entry.kind), [
    'governance-evidence-directory',
    'governance-registry',
    'governance-registry-manifest',
  ])
  assert.equal(first.statistics['governance-evidence-directory'], 1)
  assert.equal(first.schemaInventory['schema-a'], 1)
  assert.equal(first.integrity.algorithm, 'fnv1a-32')
  assert.match(first.integrity.digest, /^[0-9a-f]{8}$/)
  assert.ok(Object.isFrozen(first))
  assert.ok(Object.isFrozen(first.entries))
  assert.ok(Object.isFrozen(first.entries[0]))
})

test('suppresses duplicate artifact identifiers', () => {
  const source = directory()
  source.entries = Object.freeze([source.entries[0], source.entries[0]])
  source.entryCount = 2
  const catalog = createClusterRuntimeHealthGovernanceEvidenceCatalog(source)
  assert.equal(catalog.entryCount, 2)
})

test('fails closed for unsafe or malformed evidence directories', () => {
  const unsafe = directory()
  unsafe.safety = { ...unsafe.safety, infrastructureMutationEnabled: true } as never
  assert.throws(() => createClusterRuntimeHealthGovernanceEvidenceCatalog(unsafe), /unsafe/)

  const invalidCount = directory()
  invalidCount.entryCount = 99
  assert.throws(() => createClusterRuntimeHealthGovernanceEvidenceCatalog(invalidCount), /count/)

  const invalidEntry = directory()
  invalidEntry.entries = [{ ...invalidEntry.entries[0], generatedAt: '2026-07-25T00:00:00.000Z' }, invalidEntry.entries[1]]
  assert.throws(() => createClusterRuntimeHealthGovernanceEvidenceCatalog(invalidEntry), /entry/)
})
