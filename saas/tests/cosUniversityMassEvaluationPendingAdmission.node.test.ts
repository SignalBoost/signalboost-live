import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const migration = fs.readFileSync(
  'supabase/migrations/20261001110000_mass_evaluation_pending_admission_guard.sql',
  'utf8',
)

test('mass artifacts cannot enter evaluation_pending without the complete exact prerequisite chain', () => {
  assert.match(migration, /new\.status = 'evaluation_pending'/)
  assert.match(migration, /new\.candidate_id like 'mass:%'/)
  assert.match(migration, /r\.stage = 'complete'/)
  assert.match(migration, /r\.completed_at is not null/)
  assert.match(migration, /r\.trained_artifact_id = new\.trained_artifact_id/)
  assert.match(migration, /r\.trained_artifact_hash = new\.trained_artifact_hash/)
  assert.match(migration, /r\.revision_key = new\.revision_key/)
  assert.match(migration, /r\.dataset_hash = new\.dataset_hash/)
  assert.match(migration, /training_data_ref/)
  assert.match(migration, /holdout_data_ref/)
  assert.match(migration, /training_manifest_hash/)
  assert.match(migration, /holdout_manifest_hash/)
  assert.match(migration, /evidence_ref/)
  assert.match(migration, /rollback_artifact_ref/)
  assert.match(migration, /raise exception 'mass_artifact_evaluation_admission_prerequisites_missing:%'/)
})

test('guard applies only on entry so current pending lifecycle updates remain untouched', () => {
  assert.match(migration, /tg_op = 'INSERT' or old\.status is distinct from 'evaluation_pending'/)
  assert.match(migration, /before insert or update of status/)
})
