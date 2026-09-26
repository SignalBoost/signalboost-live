// Autonomous 24-hour graduate artifact routing lease.
// Lifecycle remains authoritative: this module only selects among already-active,
// already-governed graduates. It never promotes, quarantines, retires, or widens scope.

export const GRADUATE_ROTATION_LEASE_MS = 24 * 60 * 60 * 1000
export const GRADUATE_ROTATION_VERSION = 'cos-graduate-rotation-v1' as const

export type RotatableGraduate = Readonly<{
  registryId: string
  candidateId: string
  trainedArtifactHash: string
}>

export type GraduateRotationDecision<T extends RotatableGraduate> = Readonly<{
  selected: T | null
  previous: T | null
  leaseNumber: number
  leaseStartedAt: string
  leaseExpiresAt: string
  reason: 'no_eligible_graduate' | 'single_eligible_graduate' | 'scheduled_24h_rotation'
}>

function identity(row: RotatableGraduate): string {
  return [row.trainedArtifactHash.toLowerCase(), row.candidateId, row.registryId].join(':')
}

export function selectGraduateFor24HourLease<T extends RotatableGraduate>(
  eligible: readonly T[],
  now = new Date(),
): GraduateRotationDecision<T> {
  const at = now.getTime()
  if (!Number.isFinite(at)) throw new Error('graduate_rotation_time_invalid')
  const leaseNumber = Math.floor(at / GRADUATE_ROTATION_LEASE_MS)
  const leaseStarted = leaseNumber * GRADUATE_ROTATION_LEASE_MS
  const leaseStartedAt = new Date(leaseStarted).toISOString()
  const leaseExpiresAt = new Date(leaseStarted + GRADUATE_ROTATION_LEASE_MS).toISOString()
  const pool = [...eligible].sort((a, b) => identity(a).localeCompare(identity(b)))
  if (!pool.length) return Object.freeze({ selected: null, previous: null, leaseNumber, leaseStartedAt, leaseExpiresAt, reason: 'no_eligible_graduate' as const })
  if (pool.length === 1) return Object.freeze({ selected: pool[0], previous: null, leaseNumber, leaseStartedAt, leaseExpiresAt, reason: 'single_eligible_graduate' as const })
  const selectedIndex = ((leaseNumber % pool.length) + pool.length) % pool.length
  const previousIndex = (((leaseNumber - 1) % pool.length) + pool.length) % pool.length
  return Object.freeze({
    selected: pool[selectedIndex],
    previous: pool[previousIndex],
    leaseNumber,
    leaseStartedAt,
    leaseExpiresAt,
    reason: 'scheduled_24h_rotation' as const,
  })
}
