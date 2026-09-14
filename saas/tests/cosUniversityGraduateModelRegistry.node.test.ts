import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { decideGraduateModelRegistration } from '../lib/ai/cos/cosUniversityGraduateModelRegistry.ts'

const H = 'a'.repeat(64)

const valid = (patch: Partial<Parameters<typeof decideGraduateModelRegistration>[0]> = {}) => ({
  candidateId: 'study-plan:11111111-1111-4111-8111-111111111111',
  subjectId: 'reasoning_decision_science',
  studentModelId: 'Qwen/Qwen3-4B',
  trainedArtifactId: 'signalboost/itmounts-student-abc123',
  trainedArtifactHash: H,
  rollbackArtifactRef: 'hf://models/signalboost/itmounts-student-abc123@rollback',
  eligibleForPromotion: true,
  authorityExpanded: false,
  promotedAt: new Date('2026-09-13T23:00:00.000Z'),
  ...patch,
})

test('a non-promoted student is not yet an adoption obligation', () => {
  const decision = decideGraduateModelRegistration(valid({ eligibleForPromotion: false }))
  assert.equal(decision.adoptionRequired, false)
  assert.equal(decision.eligibleForRegistry, false)
  assert.equal(decision.status, 'not_promoted')
})

test('a promoted distilled student becomes a pending-runtime iTMounts graduate', () => {
  const decision = decideGraduateModelRegistration(valid())
  assert.equal(decision.adoptionRequired, true)
  assert.equal(decision.eligibleForRegistry, true)
  assert.equal(decision.status, 'pending_runtime')
  assert.match(decision.promotionEvidenceHash || '', /^[a-f0-9]{64}$/)
  assert.deepEqual(decision.blockers, [])
})

test('promotion identity is deterministic across reconciliation time', () => {
  const first = decideGraduateModelRegistration(valid({ promotedAt: new Date('2026-09-13T23:00:00.000Z') }))
  const later = decideGraduateModelRegistration(valid({ promotedAt: new Date('2026-09-14T03:00:00.000Z') }))
  assert.equal(first.promotionEvidenceHash, later.promotionEvidenceHash)
})

test('a promoted graduate cannot enter the registry without rollback or with expanded authority', () => {
  const noRollback = decideGraduateModelRegistration(valid({ rollbackArtifactRef: null }))
  assert.equal(noRollback.status, 'blocked')
  assert.ok(noRollback.blockers.includes('graduate_rollback_artifact_ref_missing'))

  const expanded = decideGraduateModelRegistration(valid({ authorityExpanded: true }))
  assert.equal(expanded.status, 'blocked')
  assert.ok(expanded.blockers.includes('graduate_authority_expansion_forbidden'))
})

test('database contract keeps active graduates fail-closed behind runtime evidence', () => {
  const migration = readFileSync(
    new URL('../supabase/migrations/20260913234500_cos_university_graduate_model_registry.sql', import.meta.url),
    'utf8',
  )
  assert.match(migration, /status in \('pending_runtime','canary','active','quarantined','retired'\)/)
  assert.match(migration, /status <> 'active'/)
  assert.match(migration, /runtime_health_evidence_hash is not null/)
  assert.match(migration, /activation_evidence_hash is not null/)
  assert.match(migration, /authority_expanded boolean not null default false check \(authority_expanded is false\)/)
})
