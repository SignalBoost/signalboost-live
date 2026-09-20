// saas/tests/cosUniversityGraduateArtifactSync.node.test.ts
//
// The Reasoning & Decision Science graduate is `active` in cos_university_graduate_model_registry while its
// own row in cos_local_distillation_artifacts still says `runtime_pending`. Nothing reconciled them, because
// neither registration nor activation ever writes back to the artifact ledger.
//
// These tests pin the narrow direction that is safe to automate - a live runtime advances its own artifact -
// and, more importantly, every direction that must stay manual or belong to another path.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  decideGraduateArtifactLifecycleSync,
  type DistillationArtifactRow,
  type GraduateRegistryRow,
} from '../lib/ai/cos/cosUniversityGraduateArtifactSync.ts'

const hashA = 'bd7b151e'.padEnd(64, 'a')
const hashB = '4f10c7d2'.padEnd(64, 'b')
const reasoning = 'mass:reasoning_decision_science:1'

const registry = (status: string, artifactHash = hashA, candidateId = reasoning): GraduateRegistryRow =>
  ({ candidateId, artifactHash, status })
const artifact = (status: string, artifactHash = hashA, candidateId = reasoning): DistillationArtifactRow =>
  ({ candidateId, artifactHash, status })

test('an active graduate advances its own runtime_pending artifact', () => {
  const sync = decideGraduateArtifactLifecycleSync({
    registry: [registry('active')],
    artifacts: [artifact('runtime_pending')],
  })
  assert.equal(sync.length, 1)
  assert.equal(sync[0].candidateId, reasoning)
  assert.equal(sync[0].artifactHash, hashA)
  assert.equal(sync[0].fromStatus, 'runtime_pending')
  assert.equal(sync[0].toStatus, 'active')
  assert.equal(sync[0].reason, 'graduate_runtime_active')
})

test('a registry row that does not prove a live runtime advances nothing', () => {
  for (const status of ['pending_runtime', 'canary', 'quarantined', 'retired', '']) {
    assert.equal(decideGraduateArtifactLifecycleSync({
      registry: [registry(status)],
      artifacts: [artifact('runtime_pending')],
    }).length, 0, status)
  }
})

test('only a runtime_pending artifact may advance - no other state is touched', () => {
  for (const status of ['evaluation_pending', 'trained_pending_rollback', 'quarantined', 'retired', 'active']) {
    assert.equal(decideGraduateArtifactLifecycleSync({
      registry: [registry('active')],
      artifacts: [artifact(status)],
    }).length, 0, status)
  }
})

test('pairing is by candidate AND artifact hash, never by candidate alone', () => {
  // Same candidate, a different trained artifact: the activated one is hashA, so hashB must not ride along.
  const sync = decideGraduateArtifactLifecycleSync({
    registry: [registry('active', hashA)],
    artifacts: [artifact('runtime_pending', hashB), artifact('runtime_pending', hashA)],
  })
  assert.equal(sync.length, 1)
  assert.equal(sync[0].artifactHash, hashA)
})

test('malformed rows are ignored rather than guessed at', () => {
  assert.equal(decideGraduateArtifactLifecycleSync({
    registry: [registry('active', 'not-a-hash')],
    artifacts: [artifact('runtime_pending', 'not-a-hash')],
  }).length, 0)
  assert.equal(decideGraduateArtifactLifecycleSync({
    registry: [registry('active', hashA, '')],
    artifacts: [artifact('runtime_pending', hashA, '')],
  }).length, 0)
  // Hash case must not decide the outcome.
  assert.equal(decideGraduateArtifactLifecycleSync({
    registry: [registry('active', hashA.toUpperCase())],
    artifacts: [artifact('runtime_pending', hashA)],
  }).length, 1)
})

test('repeated artifact rows produce one write, and an empty registry is a no-op', () => {
  assert.equal(decideGraduateArtifactLifecycleSync({
    registry: [registry('active')],
    artifacts: [artifact('runtime_pending'), artifact('runtime_pending')],
  }).length, 1)
  assert.equal(decideGraduateArtifactLifecycleSync({ registry: [], artifacts: [artifact('runtime_pending')] }).length, 0)
})

test('the activation cron reconciles before its own flag gate and writes under a status guard', () => {
  const route = readFileSync(
    new URL('../app/api/cron/cos-university-graduate-activation/route.ts', import.meta.url),
    'utf8',
  )
  assert.match(route, /decideGraduateArtifactLifecycleSync/)
  // Idempotent: the update can only move a row that is still runtime_pending.
  assert.match(route, /\.eq\('status', item\.fromStatus\)/)
  // Bookkeeping about an activation that already happened, so it runs before the activation flag.
  const syncAt = route.indexOf('reconcileGraduateArtifactLifecycle()')
  const flagAt = route.indexOf('ACTIVATION_ENABLED_FLAG] || \'\').trim() !== \'true\'')
  assert.ok(syncAt > 0 && flagAt > 0 && syncAt < flagAt, 'reconciliation must run before the activation flag gate')
})
