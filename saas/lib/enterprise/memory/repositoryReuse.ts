// Canonical repository-memory reuse decision for Enterprise Memory.
// Pure and provider-neutral: callers supply current repository identity metadata.

export const REPOSITORY_MEMORY_MAX_AGE_MS = 24 * 60 * 60 * 1000

export type RepositoryMemoryStatus = 'fresh' | 'stale' | 'refreshing' | 'failed' | 'invalidated' | 'partial'

export type RepositoryMemorySnapshot = {
  status: RepositoryMemoryStatus
  analyzedAt: string
  expiresAt?: string | null
  lastAnalyzedCommitSha?: string | null
  repositoryFingerprint?: string | null
  analysisVersion?: number | null
}

export type CurrentRepositoryIdentity = {
  commitSha?: string | null
  repositoryFingerprint?: string | null
  requiredAnalysisVersion?: number
}

export type RepositoryReuseDecision = {
  reuse: boolean
  refreshRequired: boolean
  reason:
    | 'no_snapshot'
    | 'snapshot_unusable'
    | 'invalid_clock'
    | 'invalid_analyzed_at'
    | 'invalid_expires_at'
    | 'snapshot_expired'
    | 'snapshot_too_old'
    | 'analysis_version_changed'
    | 'commit_changed'
    | 'fingerprint_changed'
    | 'repository_identity_missing'
    | 'unchanged_repository'
}

function clean(value?: string | null): string {
  return (value || '').trim()
}

function validTime(value: string): number | null {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function decideRepositoryMemoryReuse(
  snapshot: RepositoryMemorySnapshot | null,
  current: CurrentRepositoryIdentity,
  now = Date.now(),
): RepositoryReuseDecision {
  if (!snapshot) return { reuse: false, refreshRequired: true, reason: 'no_snapshot' }
  if (!Number.isFinite(now)) return { reuse: false, refreshRequired: true, reason: 'invalid_clock' }
  if (snapshot.status === 'failed' || snapshot.status === 'invalidated' || snapshot.status === 'stale') {
    return { reuse: false, refreshRequired: true, reason: 'snapshot_unusable' }
  }

  const analyzedAt = validTime(snapshot.analyzedAt)
  if (analyzedAt === null) return { reuse: false, refreshRequired: true, reason: 'invalid_analyzed_at' }

  if (snapshot.expiresAt) {
    const expiresAt = validTime(snapshot.expiresAt)
    if (expiresAt === null) return { reuse: false, refreshRequired: true, reason: 'invalid_expires_at' }
    if (expiresAt <= now) return { reuse: false, refreshRequired: true, reason: 'snapshot_expired' }
  }

  if (now - analyzedAt > REPOSITORY_MEMORY_MAX_AGE_MS) {
    return { reuse: false, refreshRequired: true, reason: 'snapshot_too_old' }
  }

  const requiredVersion = current.requiredAnalysisVersion ?? 1
  if (!Number.isSafeInteger(requiredVersion) || requiredVersion <= 0 || snapshot.analysisVersion !== requiredVersion) {
    return { reuse: false, refreshRequired: true, reason: 'analysis_version_changed' }
  }

  const currentCommit = clean(current.commitSha)
  const storedCommit = clean(snapshot.lastAnalyzedCommitSha)
  if (currentCommit && storedCommit) {
    return currentCommit === storedCommit
      ? { reuse: true, refreshRequired: false, reason: 'unchanged_repository' }
      : { reuse: false, refreshRequired: true, reason: 'commit_changed' }
  }

  const currentFingerprint = clean(current.repositoryFingerprint)
  const storedFingerprint = clean(snapshot.repositoryFingerprint)
  if (currentFingerprint && storedFingerprint) {
    return currentFingerprint === storedFingerprint
      ? { reuse: true, refreshRequired: false, reason: 'unchanged_repository' }
      : { reuse: false, refreshRequired: true, reason: 'fingerprint_changed' }
  }

  // Never reuse when neither side can prove repository identity. Age alone is not enough.
  return { reuse: false, refreshRequired: true, reason: 'repository_identity_missing' }
}
