import assert from 'node:assert/strict'
import test from 'node:test'
import {
  REPOSITORY_MEMORY_MAX_AGE_MS,
  decideRepositoryMemoryReuse,
  type RepositoryMemorySnapshot,
} from '../lib/enterprise/memory/repositoryReuse.ts'

const NOW = Date.parse('2026-07-18T12:00:00.000Z')

function snapshot(overrides: Partial<RepositoryMemorySnapshot> = {}): RepositoryMemorySnapshot {
  return {
    status: 'fresh',
    analyzedAt: new Date(NOW - 60_000).toISOString(),
    expiresAt: new Date(NOW + 60_000).toISOString(),
    lastAnalyzedCommitSha: 'abc123',
    repositoryFingerprint: 'repo-fingerprint-v1',
    analysisVersion: 1,
    ...overrides,
  }
}

test('reuses a fresh snapshot when the commit is unchanged', () => {
  assert.deepEqual(
    decideRepositoryMemoryReuse(snapshot(), { commitSha: 'abc123', requiredAnalysisVersion: 1 }, NOW),
    { reuse: true, refreshRequired: false, reason: 'unchanged_repository' },
  )
})

test('refreshes when the commit changed', () => {
  assert.equal(decideRepositoryMemoryReuse(snapshot(), { commitSha: 'def456' }, NOW).reason, 'commit_changed')
})

test('uses the fingerprint when commit identity is unavailable', () => {
  const stored = snapshot({ lastAnalyzedCommitSha: '' })
  assert.equal(
    decideRepositoryMemoryReuse(stored, { repositoryFingerprint: 'repo-fingerprint-v1' }, NOW).reuse,
    true,
  )
  assert.equal(
    decideRepositoryMemoryReuse(stored, { repositoryFingerprint: 'repo-fingerprint-v2' }, NOW).reason,
    'fingerprint_changed',
  )
})

test('does not reuse without a comparable repository identity', () => {
  assert.equal(
    decideRepositoryMemoryReuse(snapshot({ lastAnalyzedCommitSha: '', repositoryFingerprint: '' }), {}, NOW).reason,
    'repository_identity_missing',
  )
})

test('refreshes expired and over-age snapshots', () => {
  assert.equal(
    decideRepositoryMemoryReuse(snapshot({ expiresAt: new Date(NOW).toISOString() }), { commitSha: 'abc123' }, NOW).reason,
    'snapshot_expired',
  )
  assert.equal(
    decideRepositoryMemoryReuse(
      snapshot({ expiresAt: null, analyzedAt: new Date(NOW - REPOSITORY_MEMORY_MAX_AGE_MS - 1).toISOString() }),
      { commitSha: 'abc123' },
      NOW,
    ).reason,
    'snapshot_too_old',
  )
})

test('fails closed on invalid timestamps and clock values', () => {
  assert.equal(decideRepositoryMemoryReuse(snapshot({ analyzedAt: 'bad' }), { commitSha: 'abc123' }, NOW).reason, 'invalid_analyzed_at')
  assert.equal(decideRepositoryMemoryReuse(snapshot({ expiresAt: 'bad' }), { commitSha: 'abc123' }, NOW).reason, 'invalid_expires_at')
  assert.equal(decideRepositoryMemoryReuse(snapshot(), { commitSha: 'abc123' }, Number.NaN).reason, 'invalid_clock')
})

test('refreshes unusable status and analysis-version changes', () => {
  assert.equal(decideRepositoryMemoryReuse(snapshot({ status: 'invalidated' }), { commitSha: 'abc123' }, NOW).reason, 'snapshot_unusable')
  assert.equal(decideRepositoryMemoryReuse(snapshot({ analysisVersion: 1 }), { commitSha: 'abc123', requiredAnalysisVersion: 2 }, NOW).reason, 'analysis_version_changed')
})

test('missing snapshot always requires refresh', () => {
  assert.deepEqual(decideRepositoryMemoryReuse(null, { commitSha: 'abc123' }, NOW), {
    reuse: false,
    refreshRequired: true,
    reason: 'no_snapshot',
  })
})
