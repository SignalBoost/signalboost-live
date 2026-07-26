import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createClusterRuntimeHealthGovernanceEvidenceRegistry,
  type ClusterRuntimeHealthGovernanceEvidenceCatalog,
} from './cluster-runtime-health-governance-evidence-registry.ts'

const generatedAt = '2026-07-26T00:00:00.000Z'

function catalog(): ClusterRuntimeHealthGovernanceEvidenceCatalog {
  return {
    schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-catalog-v1',
    evidenceCatalogId: 'cluster-a:evidence-catalog',
    clusterId: 'cluster-a',
    generatedAt,
    directoryId: 'cluster-a:directory',
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
        schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-catalog-entry-v1',
        artifactId: 'artifact-b', kind: 'governance-evidence-directory', schema: 'schema-b', generatedAt,
        integrityDigest: '22222222', provenance: ['root'], retentionClass: 'governance-evidence', readOnly: true, executable: false,
      },
      {
        schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-catalog-entry-v1',
        artifactId: 'artifact-a', kind: 'governance-registry', schema: 'schema-a', generatedAt,
        integrityDigest: '11111111', provenance: ['root'], retentionClass: 'governance-evidence', readOnly: true, executable: false,
      },
    ],
    statistics: Object.freeze({}), schemaInventory: Object.freeze({}),
    integrity: Object.freeze({ algorithm: 'fnv1a-32', digest: '1234abcd', canonical: true, appendOnlyCompatible: true }),
    retentionClass: 'governance-evidence',
    safety: Object.freeze({ readOnly: true, advisoryOnly: true, automaticRetryEnabled: false, automaticRepairEnabled: false, infrastructureMutationEnabled: false }),
    executable: false,
  }
}

test('creates deterministic immutable evidence registry', () => {
  const first = createClusterRuntimeHealthGovernanceEvidenceRegistry(catalog())
  const second = createClusterRuntimeHealthGovernanceEvidenceRegistry(catalog())
  assert.deepEqual(first, second)
  assert.equal(first.entryCount, 3)
  assert.deepEqual(first.entries.map(entry => entry.kind), ['governance-evidence-catalog', 'governance-evidence-directory', 'governance-registry'])
  assert.equal(first.statistics['governance-evidence-catalog'], 1)
  assert.equal(first.schemaInventory['schema-a'], 1)
  assert.match(first.integrity.digest, /^[0-9a-f]{8}$/)
  assert.ok(Object.isFrozen(first))
  assert.ok(Object.isFrozen(first.entries))
  assert.ok(Object.isFrozen(first.entries[0]))
})

test('suppresses duplicate artifact identifiers', () => {
  const source = catalog()
  source.entries = Object.freeze([source.entries[0], source.entries[0]])
  source.entryCount = 2
  assert.equal(createClusterRuntimeHealthGovernanceEvidenceRegistry(source).entryCount, 2)
})

test('fails closed for unsafe or malformed evidence catalogs', () => {
  const unsafe = catalog()
  unsafe.safety = { ...unsafe.safety, infrastructureMutationEnabled: true } as never
  assert.throws(() => createClusterRuntimeHealthGovernanceEvidenceRegistry(unsafe), /unsafe/)
  const invalidCount = catalog()
  invalidCount.entryCount = 99
  assert.throws(() => createClusterRuntimeHealthGovernanceEvidenceRegistry(invalidCount), /count/)
  const invalidEntry = catalog()
  invalidEntry.entries = [{ ...invalidEntry.entries[0], generatedAt: '2026-07-25T00:00:00.000Z' }, invalidEntry.entries[1]]
  assert.throws(() => createClusterRuntimeHealthGovernanceEvidenceRegistry(invalidEntry), /entry/)
})
