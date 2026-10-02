import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const migration = readFileSync(
  new URL('../supabase/migrations/20261002000500_artifact_permanent_identity_birth_certificate.sql', import.meta.url),
  'utf8',
)

test('artifact identity is assigned before post-training lifecycle use', () => {
  assert.match(migration, /permanent_artifact_id uuid/)
  assert.match(migration, /alter column permanent_artifact_id set default gen_random_uuid\(\)/)
  assert.match(migration, /alter column permanent_artifact_id set not null/)
  assert.match(migration, /unique index[\s\S]*permanent_artifact_id/)
  assert.match(migration, /after insert on public\.cos_local_distillation_artifacts/)
  assert.match(migration, /'native_birth'/)
})

test('birth certificate preserves exact artifact provenance without inventing legacy history', () => {
  for (const field of [
    'candidate_id',
    'trained_artifact_hash',
    'creator',
    'issuing_system',
    'student_model_id',
    'teacher_model_id',
    'training_evidence_ref',
    'revision_key',
    'dataset_hash',
    'born_at',
  ]) assert.match(migration, new RegExp(field))
  assert.match(migration, /'legacy_backfill'/)
  assert.match(migration, /from public\.cos_local_distillation_artifacts a/)
  assert.doesNotMatch(migration, /origin_jurisdiction[^\n]*'[^']+'/)
})

test('birth certificate is immutable and not publicly writable', () => {
  assert.match(migration, /artifact_birth_certificate_is_immutable/)
  assert.match(migration, /before update or delete/)
  assert.match(migration, /revoke all on table public\.cos_university_artifact_birth_certificates from public, anon, authenticated/)
  assert.match(migration, /authority_expanded boolean not null default false/)
})
