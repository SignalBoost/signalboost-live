// saas/lib/enterprise/memory/refreshPolicy.ts
// Pure, fail-closed refresh decisions for Enterprise Memory.

const DAY = 24 * 60 * 60 * 1000

export const ENTERPRISE_MEMORY_REFRESH_POLICY = {
  companyProfileMs: 30 * DAY,
  intelligenceSnapshotMs: 14 * DAY,
  repositoryMs: DAY,
  audienceMs: 30 * DAY,
} as const

export type EnterpriseMemoryStatus = 'fresh' | 'stale' | 'refreshing' | 'failed' | 'invalidated' | 'partial'

export type RefreshableOrganizationMemory = {
  status: EnterpriseMemoryStatus
  profileRefreshedAt: string
}

export type RefreshableIntelligenceSnapshot = {
  status: EnterpriseMemoryStatus
  analyzedAt: string
  expiresAt: string | null
}

export type EnterpriseMemoryRefreshRequirements = {
  organizationStale: boolean
  snapshotStale: boolean
  reason: string
}

function timestamp(value: string | null | undefined): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function determineEnterpriseMemoryRefreshRequirements(
  organization: RefreshableOrganizationMemory,
  snapshot: RefreshableIntelligenceSnapshot | null,
  now = Date.now(),
): EnterpriseMemoryRefreshRequirements {
  if (!Number.isFinite(now)) {
    throw new Error('Enterprise Memory refresh time must be finite.')
  }

  if (organization.status === 'invalidated' || organization.status === 'failed') {
    return {
      organizationStale: true,
      snapshotStale: true,
      reason: `organization ${organization.status}`,
    }
  }

  const profileRefreshedAt = timestamp(organization.profileRefreshedAt)
  if (profileRefreshedAt === null) {
    return {
      organizationStale: true,
      snapshotStale: true,
      reason: 'organization refresh timestamp missing or invalid',
    }
  }

  if (!snapshot) {
    return { organizationStale: false, snapshotStale: true, reason: 'no snapshot for workspace' }
  }

  if (snapshot.status === 'invalidated' || snapshot.status === 'failed') {
    return { organizationStale: false, snapshotStale: true, reason: `snapshot ${snapshot.status}` }
  }

  const analyzedAt = timestamp(snapshot.analyzedAt)
  if (analyzedAt === null) {
    return { organizationStale: false, snapshotStale: true, reason: 'snapshot analysis timestamp missing or invalid' }
  }

  const expiresAt = timestamp(snapshot.expiresAt)
  if (snapshot.expiresAt && expiresAt === null) {
    return { organizationStale: false, snapshotStale: true, reason: 'snapshot expiry timestamp invalid' }
  }

  if (expiresAt !== null && expiresAt <= now) {
    return { organizationStale: false, snapshotStale: true, reason: 'snapshot expired' }
  }

  if (now - analyzedAt > ENTERPRISE_MEMORY_REFRESH_POLICY.intelligenceSnapshotMs) {
    return { organizationStale: false, snapshotStale: true, reason: 'snapshot past max age' }
  }

  const organizationStale = now - profileRefreshedAt > ENTERPRISE_MEMORY_REFRESH_POLICY.companyProfileMs
  return {
    organizationStale,
    snapshotStale: false,
    reason: organizationStale ? 'profile past max age' : 'fresh',
  }
}
