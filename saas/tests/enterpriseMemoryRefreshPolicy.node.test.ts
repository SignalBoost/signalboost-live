import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ENTERPRISE_MEMORY_REFRESH_POLICY,
  determineEnterpriseMemoryRefreshRequirements,
} from '../lib/enterprise/memory/refreshPolicy.ts'

const NOW = Date.parse('2026-07-18T12:00:00.000Z')
const freshOrganization = {
  status: 'fresh' as const,
  profileRefreshedAt: new Date(NOW - ENTERPRISE_MEMORY_REFRESH_POLICY.companyProfileMs + 1).toISOString(),
}
const freshSnapshot = {
  status: 'fresh' as const,
  analyzedAt: new Date(NOW - ENTERPRISE_MEMORY_REFRESH_POLICY.intelligenceSnapshotMs + 1).toISOString(),
  expiresAt: new Date(NOW + 60_000).toISOString(),
}

test('fresh organization and snapshot are reused', () => {
  assert.deepEqual(
    determineEnterpriseMemoryRefreshRequirements(freshOrganization, freshSnapshot, NOW),
    { organizationStale: false, snapshotStale: false, reason: 'fresh' },
  )
})

test('missing snapshot requires analysis', () => {
  assert.deepEqual(
    determineEnterpriseMemoryRefreshRequirements(freshOrganization, null, NOW),
    { organizationStale: false, snapshotStale: true, reason: 'no snapshot for workspace' },
  )
})

test('invalid organization timestamp fails closed', () => {
  assert.deepEqual(
    determineEnterpriseMemoryRefreshRequirements(
      { ...freshOrganization, profileRefreshedAt: 'not-a-date' },
      freshSnapshot,
      NOW,
    ),
    {
      organizationStale: true,
      snapshotStale: true,
      reason: 'organization refresh timestamp missing or invalid',
    },
  )
})

test('invalid snapshot timestamps fail closed', () => {
  assert.deepEqual(
    determineEnterpriseMemoryRefreshRequirements(
      freshOrganization,
      { ...freshSnapshot, analyzedAt: '' },
      NOW,
    ),
    {
      organizationStale: false,
      snapshotStale: true,
      reason: 'snapshot analysis timestamp missing or invalid',
    },
  )

  assert.deepEqual(
    determineEnterpriseMemoryRefreshRequirements(
      freshOrganization,
      { ...freshSnapshot, expiresAt: 'invalid' },
      NOW,
    ),
    {
      organizationStale: false,
      snapshotStale: true,
      reason: 'snapshot expiry timestamp invalid',
    },
  )
})

test('expired and over-age snapshots require refresh', () => {
  assert.equal(
    determineEnterpriseMemoryRefreshRequirements(
      freshOrganization,
      { ...freshSnapshot, expiresAt: new Date(NOW).toISOString() },
      NOW,
    ).reason,
    'snapshot expired',
  )

  assert.equal(
    determineEnterpriseMemoryRefreshRequirements(
      freshOrganization,
      {
        ...freshSnapshot,
        expiresAt: null,
        analyzedAt: new Date(NOW - ENTERPRISE_MEMORY_REFRESH_POLICY.intelligenceSnapshotMs - 1).toISOString(),
      },
      NOW,
    ).reason,
    'snapshot past max age',
  )
})

test('failed or invalidated organization forces full refresh', () => {
  for (const status of ['failed', 'invalidated'] as const) {
    assert.deepEqual(
      determineEnterpriseMemoryRefreshRequirements({ ...freshOrganization, status }, freshSnapshot, NOW),
      {
        organizationStale: true,
        snapshotStale: true,
        reason: `organization ${status}`,
      },
    )
  }
})

test('non-finite clock is rejected', () => {
  assert.throws(
    () => determineEnterpriseMemoryRefreshRequirements(freshOrganization, freshSnapshot, Number.NaN),
    /must be finite/,
  )
})
